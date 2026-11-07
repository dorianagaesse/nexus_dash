// Recipient inbox, invitation landing, and email-bound accept/decline lifecycle.

import { prisma } from "@/lib/prisma";
import { validateEmail } from "@/lib/services/account-security-policy";
import { touchProjectMembershipActivity } from "@/lib/services/project-activity-service";
import { resolveProjectInvitationNotifications } from "@/lib/services/notification-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import { logServerWarning } from "@/lib/observability/logger";
import {
  type ServiceResult,
  type ProjectInvitationSummary,
  type ProjectInvitationRecipientView,
} from "./collaboration-types";
import {
  createError,
  createSuccess,
  normalizeActorUserId,
  normalizeInvitationId,
  normalizeInvitationEmail,
  requireCollaboratorRole,
  isUniqueConstraintError,
  buildIdentitySummary,
  buildInvitationTerminalState,
  buildProjectInvitationSummary,
} from "./collaboration-policy";
import {
  listPendingInvitationMetadataRows,
  getVerifiedUsersByEmail,
  findInvitationById,
} from "./invitation-data";

export async function listPendingProjectInvitationsForUser(
  actorUserId: string
): Promise<ServiceResult<{ invitations: ProjectInvitationSummary[] }>> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const now = new Date();

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const [actor, invitations] = await Promise.all([
      db.user.findUnique({
        where: { id: normalizedActorUserId },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          usernameDiscriminator: true,
          avatarSeed: true,
        },
      }),
      listPendingInvitationMetadataRows(db),
    ]);

    if (!actor) {
      return createError(401, "unauthorized");
    }

    const actorIdentity = buildIdentitySummary(actor);

    const activeInvitations = invitations.filter((invitation) => {
      return invitation.expiresAt.getTime() > now.getTime();
    });

    return createSuccess(200, {
      invitations: activeInvitations.map((invitation) => ({
        ...buildProjectInvitationSummary({
          invitation,
          invitedBy: {
            email: invitation.invitedByEmail,
            name: invitation.invitedByName,
            username: invitation.invitedByUsername,
            usernameDiscriminator: invitation.invitedByUsernameDiscriminator,
          },
          matchedInvitee: actor,
        }),
        invitedUserId: actorIdentity.id,
        invitedUserDisplayName: actorIdentity.displayName,
        invitedUserUsernameTag: actorIdentity.usernameTag,
      })),
    });
  });
}

export async function countPendingProjectInvitationsForUser(
  actorUserId: string
): Promise<number> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return 0;
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const invitations = await listPendingInvitationMetadataRows(db);
    return invitations.length;
  });
}

export async function respondToProjectInvitation(input: {
  actorUserId: string;
  invitationId: string;
  decision: "accept" | "decline";
}): Promise<ServiceResult<{ projectId: string }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const invitationId = normalizeInvitationId(input.invitationId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!invitationId) {
    return createError(400, "invitation-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const actor = await db.user.findUnique({
      where: { id: actorUserId },
      select: {
        email: true,
        emailVerified: true,
      },
    });

    if (!actor?.emailVerified) {
      return createError(403, "email-unverified");
    }

    const actorEmail = normalizeInvitationEmail(actor.email);
    if (!validateEmail(actorEmail)) {
      return createError(403, "invitation-email-mismatch");
    }

    const invitation = await db.projectInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        projectId: true,
        invitedEmail: true,
        role: true,
        acceptedAt: true,
        revokedAt: true,
        replacedAt: true,
        expiresAt: true,
      },
    });

    if (!invitation) {
      return createError(404, "invitation-not-found");
    }

    const resolveCurrentInvitationNotification = async () => {
      await resolveProjectInvitationNotifications({
        db,
        invitationIds: [invitation.id],
      });
    };
    const touchAcceptedMembershipActivity = async (acceptedAt: Date) => {
      try {
        await touchProjectMembershipActivity({
          db,
          actorUserId,
          projectId: invitation.projectId,
          invitationId: invitation.id,
          occurredAt: acceptedAt,
        });
      } catch (error) {
        logServerWarning(
          "respondToProjectInvitation.activityTouchFailed",
          "Could not advance project activity after invitation acceptance",
          {
            actorUserId,
            projectId: invitation.projectId,
            invitationId: invitation.id,
            error,
          }
        );
      }
    };

    if (invitation.acceptedAt) {
      await resolveCurrentInvitationNotification();
      await touchAcceptedMembershipActivity(invitation.acceptedAt);
      return createSuccess(200, { projectId: invitation.projectId });
    }

    if (invitation.replacedAt) {
      await resolveCurrentInvitationNotification();
      return createError(409, "invitation-replaced");
    }

    if (invitation.revokedAt) {
      await resolveCurrentInvitationNotification();
      return createError(409, "invitation-revoked");
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      await resolveCurrentInvitationNotification();
      return createError(409, "invitation-expired");
    }

    if (invitation.invitedEmail !== actorEmail) {
      return createError(403, "invitation-email-mismatch");
    }

    if (input.decision === "decline") {
      const declinedAt = new Date();
      const declinedInvitation = await db.projectInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          replacedAt: null,
          expiresAt: {
            gt: declinedAt,
          },
        },
        data: {
          revokedAt: declinedAt,
        },
      });

      if (declinedInvitation.count === 1) {
        await resolveCurrentInvitationNotification();
        return createSuccess(200, { projectId: invitation.projectId });
      }

      const latestInvitation = await db.projectInvitation.findUnique({
        where: { id: invitation.id },
        select: {
          acceptedAt: true,
          revokedAt: true,
          replacedAt: true,
          expiresAt: true,
        },
      });

      if (latestInvitation?.acceptedAt) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-already-accepted");
      }

      if (latestInvitation?.replacedAt) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-replaced");
      }

      if (latestInvitation?.revokedAt) {
        await resolveCurrentInvitationNotification();
        return createSuccess(200, { projectId: invitation.projectId });
      }

      if (
        latestInvitation &&
        latestInvitation.expiresAt.getTime() <= Date.now()
      ) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-expired");
      }

      return createError(404, "invitation-not-found");
    }

    const existingMembership = await db.projectMembership.findUnique({
      where: {
        projectId_userId: {
          projectId: invitation.projectId,
          userId: actorUserId,
        },
      },
      select: {
        id: true,
      },
    });

    let createdMembership = false;

    if (!existingMembership) {
      try {
        await db.projectMembership.create({
          data: {
            projectId: invitation.projectId,
            userId: actorUserId,
            role: requireCollaboratorRole(invitation.role),
          },
        });
        createdMembership = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const acceptedAt = new Date();
    const acceptedInvitation = await db.projectInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
        expiresAt: {
          gt: acceptedAt,
        },
      },
      data: {
        acceptedAt,
      },
    });

    if (acceptedInvitation.count === 0) {
      const latestInvitation = await db.projectInvitation.findUnique({
        where: { id: invitation.id },
        select: {
          projectId: true,
          acceptedAt: true,
          revokedAt: true,
          replacedAt: true,
          expiresAt: true,
        },
      });

      if (latestInvitation?.acceptedAt) {
        await resolveCurrentInvitationNotification();
        await touchAcceptedMembershipActivity(latestInvitation.acceptedAt);
        return createSuccess(200, { projectId: latestInvitation.projectId });
      }

      if (
        createdMembership &&
        (latestInvitation?.replacedAt ||
          latestInvitation?.revokedAt ||
          (latestInvitation &&
            latestInvitation.expiresAt.getTime() <= Date.now()) ||
          !latestInvitation)
      ) {
        await db.projectMembership.deleteMany({
          where: {
            projectId: invitation.projectId,
            userId: actorUserId,
          },
        });
      }

      if (latestInvitation?.replacedAt) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-replaced");
      }

      if (latestInvitation?.revokedAt) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-revoked");
      }

      if (
        latestInvitation &&
        latestInvitation.expiresAt.getTime() <= Date.now()
      ) {
        await resolveCurrentInvitationNotification();
        return createError(409, "invitation-expired");
      }

      return createError(404, "invitation-not-found");
    }

    await resolveCurrentInvitationNotification();
    await touchAcceptedMembershipActivity(acceptedAt);
    return createSuccess(200, { projectId: invitation.projectId });
  });
}

export async function getProjectInvitationRecipientView(input: {
  invitationId: string;
  actorUserId?: string | null;
}): Promise<ProjectInvitationRecipientView> {
  const invitationId = normalizeInvitationId(input.invitationId);
  if (!invitationId) {
    return {
      state: "not-found",
      invitation: null,
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    };
  }

  const invitation = await findInvitationById(invitationId);
  if (!invitation) {
    return {
      state: "not-found",
      invitation: null,
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    };
  }

  const matchedInvitees = await getVerifiedUsersByEmail(prisma, [
    invitation.invitedEmail,
  ]);
  const invitationSummary = buildProjectInvitationSummary({
    invitation,
    invitedBy: invitation.invitedByUser,
    matchedInvitee:
      matchedInvitees.get(normalizeInvitationEmail(invitation.invitedEmail)) ??
      null,
  });

  const terminalState = buildInvitationTerminalState(invitation);
  if (terminalState) {
    return {
      state: terminalState,
      invitation: invitationSummary,
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    };
  }

  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return {
      state: "sign-in-required",
      invitation: invitationSummary,
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    };
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      username: true,
      usernameDiscriminator: true,
      avatarSeed: true,
    },
  });

  if (!actor) {
    return {
      state: "sign-in-required",
      invitation: invitationSummary,
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    };
  }

  const actorSummary = buildIdentitySummary(actor);
  const actorEmailMatchesInvitation =
    normalizeInvitationEmail(actor.email) === invitation.invitedEmail;

  if (!actorEmailMatchesInvitation) {
    return {
      state: "wrong-account",
      invitation: invitationSummary,
      actor: actorSummary,
      actorEmailVerified: Boolean(actor.emailVerified),
      actorEmailMatchesInvitation,
    };
  }

  if (!actor.emailVerified) {
    return {
      state: "verification-required",
      invitation: invitationSummary,
      actor: actorSummary,
      actorEmailVerified: false,
      actorEmailMatchesInvitation,
    };
  }

  return {
    state: "accept-ready",
    invitation: invitationSummary,
    actor: actorSummary,
    actorEmailVerified: true,
    actorEmailMatchesInvitation,
  };
}
