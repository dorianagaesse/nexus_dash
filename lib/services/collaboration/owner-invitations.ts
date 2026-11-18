import { isValidCapabilityGrant } from "@/lib/project-capabilities";
// Owner-authorized invitation discovery, replacement, delivery, and revocation.

import { validateEmail } from "@/lib/services/account-security-policy";
import { requireProjectRole } from "@/lib/services/project-access-service";
import {
  createProjectInvitationNotification,
  resolveProjectInvitationNotifications,
} from "@/lib/services/notification-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import {
  type ServiceResult,
  type CollaboratorIdentitySummary,
  type ProjectInvitationSummary,
  type ProjectInvitationEmailDeliverySummary,
} from "./collaboration-types";
import {
  createError,
  createSuccess,
  normalizeActorUserId,
  normalizeInvitationId,
  normalizeSearchQuery,
  normalizeInvitationEmail,
  isCollaboratorRole,
  requireCollaboratorRole,
  isUniqueConstraintError,
  buildIdentitySummary,
  buildInvitationExpiry,
  buildPendingInvitationWhere,
  buildProjectInvitationSummary,
} from "./collaboration-policy";
import { revokeExpiredInvitationsForEmail, getVerifiedUsersByEmail } from "./invitation-data";
import { sendProjectInvitationEmail } from "./invitation-email";

const INVITABLE_USER_SEARCH_LIMIT = 8;

export async function searchInvitableUsersForProject(input: {
  actorUserId: string;
  projectId: string;
  query: string;
}): Promise<ServiceResult<{ users: CollaboratorIdentitySummary[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const query = normalizeSearchQuery(input.query);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (query.length < 2) {
    return createSuccess(200, { users: [] });
  }

  const normalizedQuery = query.toLowerCase();
  const queryWithoutTag = normalizedQuery.split("#", 1)[0] ?? normalizedQuery;
  const now = new Date();

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const [project, pendingInvitations] = await Promise.all([
      db.project.findUnique({
        where: { id: input.projectId },
        select: {
          ownerId: true,
          owner: {
            select: {
              email: true,
            },
          },
          memberships: {
            select: {
              userId: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      }),
      db.projectInvitation.findMany({
        where: {
          projectId: input.projectId,
          ...buildPendingInvitationWhere(now),
        },
        select: {
          invitedEmail: true,
        },
      }),
    ]);

    if (!project) {
      return createError(404, "project-not-found");
    }

    const excludedUserIds = new Set<string>([
      actorUserId,
      project.ownerId,
      ...project.memberships.map((membership) => membership.userId),
    ]);
    const excludedEmails = new Set<string>();

    if (project.owner.email) {
      excludedEmails.add(normalizeInvitationEmail(project.owner.email));
    }

    for (const membership of project.memberships) {
      if (membership.user.email) {
        excludedEmails.add(normalizeInvitationEmail(membership.user.email));
      }
    }

    for (const invitation of pendingInvitations) {
      excludedEmails.add(invitation.invitedEmail);
    }

    const users = await db.user.findMany({
      where: {
        emailVerified: {
          not: null,
        },
        id: {
          notIn: Array.from(excludedUserIds),
        },
        ...(excludedEmails.size > 0
          ? {
              email: {
                notIn: Array.from(excludedEmails),
              },
            }
          : {}),
        OR: [
          {
            email: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            username: {
              contains: queryWithoutTag,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        usernameDiscriminator: true,
        avatarSeed: true,
      },
      take: INVITABLE_USER_SEARCH_LIMIT,
      orderBy: [{ username: "asc" }, { name: "asc" }, { email: "asc" }],
    });

    return createSuccess(200, {
      users: users.map((user) => buildIdentitySummary(user)),
    });
  });
}

export async function inviteUserToProject(input: {
  actorUserId: string;
  projectId: string;
  invitedEmail: string;
  role: string;
  capabilities?: unknown;
  appOrigin?: string | null;
}): Promise<
  ServiceResult<{
    invitation: ProjectInvitationSummary;
    emailDelivery: ProjectInvitationEmailDeliverySummary;
  }>
> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const invitedEmail = normalizeInvitationEmail(input.invitedEmail);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!validateEmail(invitedEmail)) {
    return createError(400, "invalid-email");
  }

  if (!isCollaboratorRole(input.role)) {
    return createError(400, "invalid-role");
  }
  const invitedRole = input.role;
  if (!isValidCapabilityGrant(input.capabilities, input.role)) return createError(400, "invalid-capabilities");

  const now = new Date();

  const invitationResult = await withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    await revokeExpiredInvitationsForEmail({
      db,
      projectId: input.projectId,
      invitedEmail,
      now,
    });

    const [project, actor, matchedInvitee, existingMembership] =
      await Promise.all([
        db.project.findUnique({
          where: { id: input.projectId },
          select: {
            id: true,
            name: true,
            owner: {
              select: {
                email: true,
              },
            },
          },
        }),
        db.user.findUnique({
          where: { id: actorUserId },
          select: {
            email: true,
          },
        }),
        db.user.findUnique({
          where: { email: invitedEmail },
          select: {
            id: true,
            email: true,
            emailVerified: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        }),
        db.projectMembership.findFirst({
          where: {
            projectId: input.projectId,
            user: {
              email: invitedEmail,
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

    if (!project) {
      return createError(404, "project-not-found");
    }

    if (normalizeInvitationEmail(actor?.email) === invitedEmail) {
      return createError(400, "cannot-invite-self");
    }

    if (normalizeInvitationEmail(project.owner.email) === invitedEmail) {
      return createError(400, "cannot-invite-self");
    }

    if (existingMembership) {
      return createError(409, "already-a-member");
    }

    const invitationsToReplace = await db.projectInvitation.findMany({
      where: {
        projectId: input.projectId,
        invitedEmail,
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (invitationsToReplace.length > 0) {
      await db.projectInvitation.updateMany({
        where: {
          id: {
            in: invitationsToReplace.map((invitation) => invitation.id),
          },
        },
        data: {
          replacedAt: now,
        },
      });
      await resolveProjectInvitationNotifications({
        db,
        invitationIds: invitationsToReplace.map((invitation) => invitation.id),
      });
    }

    try {
      const invitation = await db.projectInvitation.create({
        data: {
          projectId: input.projectId,
          invitedEmail,
          invitedByUserId: actorUserId,
          role: invitedRole,
          ...(input.capabilities != null ? { capabilities: input.capabilities as string[] } : {}),
          expiresAt: buildInvitationExpiry(),
        },
        select: {
          id: true,
          projectId: true,
          invitedEmail: true,
          role: true,
          capabilities: true,
          createdAt: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          replacedAt: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedByUser: {
            select: {
              id: true,
              email: true,
              name: true,
              username: true,
              usernameDiscriminator: true,
            },
          },
        },
      });

      const invitationSummary = buildProjectInvitationSummary({
        invitation,
        invitedBy: invitation.invitedByUser,
        matchedInvitee: matchedInvitee?.emailVerified ? matchedInvitee : null,
      });

      if (matchedInvitee?.emailVerified) {
        await createProjectInvitationNotification({
          db,
          recipientUserId: matchedInvitee.id,
          invitation: {
            invitationId: invitation.id,
            projectId: invitation.projectId,
            projectName: invitation.project.name,
            invitedEmail: invitation.invitedEmail,
            invitedByEmail: invitation.invitedByUser.email,
            invitedByName: invitation.invitedByUser.name,
            invitedByUsername: invitation.invitedByUser.username,
            invitedByUsernameDiscriminator:
              invitation.invitedByUser.usernameDiscriminator,
            role: requireCollaboratorRole(invitation.role),
            createdAt: invitation.createdAt,
            expiresAt: invitation.expiresAt,
          },
        });
      }

      return createSuccess(201, {
        invitation: invitationSummary,
        invitedByUserId: invitation.invitedByUser.id,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return createError(409, "invitation-conflict");
      }

      throw error;
    }
  });

  if (!invitationResult.ok) {
    return invitationResult;
  }

  const emailDelivery = await sendProjectInvitationEmail({
    actorUserId,
    invitedByUserId: invitationResult.data.invitedByUserId,
    appOrigin: input.appOrigin,
    invitation: invitationResult.data.invitation,
  });

  return createSuccess(invitationResult.status, {
    invitation: invitationResult.data.invitation,
    emailDelivery,
  });
}

export async function sendProjectInvitationEmailForOwner(input: {
  actorUserId: string;
  projectId: string;
  invitationId: string;
  appOrigin?: string | null;
}): Promise<
  ServiceResult<{
    invitation: ProjectInvitationSummary;
    emailDelivery: ProjectInvitationEmailDeliverySummary;
  }>
> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const invitationId = normalizeInvitationId(input.invitationId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!invitationId) {
    return createError(400, "invitation-required");
  }

  const now = new Date();

  const invitationResult = await withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const invitation = await db.projectInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        projectId: true,
        invitedEmail: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        replacedAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedByUser: {
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
          },
        },
      },
    });

    if (!invitation || invitation.projectId !== input.projectId) {
      return createError(404, "invitation-not-found");
    }

    if (
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.replacedAt ||
      invitation.expiresAt.getTime() <= now.getTime()
    ) {
      return createError(409, "invitation-not-active");
    }

    const matchedInvitees = await getVerifiedUsersByEmail(db, [
      invitation.invitedEmail,
    ]);
    return createSuccess(200, {
      invitation: buildProjectInvitationSummary({
        invitation,
        invitedBy: invitation.invitedByUser,
        matchedInvitee:
          matchedInvitees.get(normalizeInvitationEmail(invitation.invitedEmail)) ??
          null,
      }),
      invitedByUserId: invitation.invitedByUser.id,
    });
  });

  if (!invitationResult.ok) {
    return invitationResult;
  }

  const emailDelivery = await sendProjectInvitationEmail({
    actorUserId,
    invitedByUserId: invitationResult.data.invitedByUserId,
    appOrigin: input.appOrigin,
    invitation: invitationResult.data.invitation,
  });

  return createSuccess(200, {
    invitation: invitationResult.data.invitation,
    emailDelivery,
  });
}

export async function revokeProjectInvitation(input: {
  actorUserId: string;
  projectId: string;
  invitationId: string;
}): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const invitationId = normalizeInvitationId(input.invitationId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!invitationId) {
    return createError(400, "invitation-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const result = await db.projectInvitation.updateMany({
      where: {
        id: invitationId,
        projectId: input.projectId,
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return createError(404, "invitation-not-found");
    }

    await resolveProjectInvitationNotifications({
      db,
      invitationIds: [invitationId],
    });

    return createSuccess(200, { ok: true as const });
  });
}
