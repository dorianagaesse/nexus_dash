// Sharing reads, member role/offboarding mutations, and project member lookup.

import type { ProjectMembershipRole } from "@prisma/client";
import { resolveAvatarSeed } from "@/lib/avatar";
import {
  type AgentProjectAccessContext,
  getProjectAccess,
  hasRequiredRole,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import {
  resolveActiveProjectResponsibilities,
  type ProjectResponsibilityInventory,
  type ResponsibilityResolution,
} from "@/lib/services/project-offboarding-service";
import {
  type ProjectCollaboratorRole,
  type ServiceResult,
  type ProjectMemberSummary,
  type ProjectSharingSummary,
} from "./collaboration-types";
import {
  createError,
  createSuccess,
  normalizeActorUserId,
  normalizeInvitationId,
  normalizeSearchQuery,
  normalizeInvitationEmail,
  isCollaboratorRole,
  buildDisplayName,
  buildIdentitySummary,
  buildPendingInvitationWhere,
  buildProjectInvitationSummary,
} from "./collaboration-policy";
import { getVerifiedUsersByEmail } from "./invitation-data";

export async function getProjectSharingSummary(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ServiceResult<ProjectSharingSummary>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

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

    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        memberships: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                usernameDiscriminator: true,
                avatarSeed: true,
              },
            },
          },
        },
        invitations: {
          where: buildPendingInvitationWhere(now),
          orderBy: [{ createdAt: "desc" }],
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
        },
      },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

    const matchedInvitees = await getVerifiedUsersByEmail(
      db,
      project.invitations.map((invitation) => invitation.invitedEmail)
    );

    return createSuccess(200, {
      projectId: project.id,
      members: project.memberships.map((membership) => {
        const identity = buildIdentitySummary(membership.user);

        return {
          membershipId: membership.id,
          role: membership.role,
          joinedAt: membership.createdAt.toISOString(),
          isOwner: membership.user.id === project.ownerId,
          ...identity,
        };
      }),
      pendingInvitations: project.invitations.map((invitation) =>
        buildProjectInvitationSummary({
          invitation: {
            ...invitation,
            project: {
              id: project.id,
              name: project.name,
            },
          },
          invitedBy: invitation.invitedByUser,
          matchedInvitee:
            matchedInvitees.get(
              normalizeInvitationEmail(invitation.invitedEmail)
            ) ?? null,
        })
      ),
    });
  });
}

export async function updateProjectMemberRole(input: {
  actorUserId: string;
  projectId: string;
  membershipId: string;
  role: string;
}): Promise<ServiceResult<{ role: ProjectCollaboratorRole }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const membershipId = normalizeInvitationId(input.membershipId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!membershipId) {
    return createError(400, "membership-required");
  }

  if (!isCollaboratorRole(input.role)) {
    return createError(400, "invalid-role");
  }
  const targetRole = input.role;

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

    const membership = await db.projectMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        role: true,
      },
    });

    if (!membership || membership.projectId !== input.projectId) {
      return createError(404, "member-not-found");
    }

    if (membership.userId === actorUserId || membership.role === "owner") {
      return createError(400, "cannot-change-owner-role");
    }

    if (membership.role === targetRole) {
      return createSuccess(200, { role: targetRole });
    }

    await db.projectMembership.update({
      where: { id: membershipId },
      data: {
        role: targetRole,
      },
    });

    return createSuccess(200, { role: targetRole });
  });
}

export async function removeProjectMember(input: {
  actorUserId: string;
  projectId: string;
  membershipId: string;
  responsibilityResolution?: ResponsibilityResolution | null;
}): Promise<
  ServiceResult<{ ok: true; resolvedInventory: ProjectResponsibilityInventory }>
> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const membershipId = normalizeInvitationId(input.membershipId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!membershipId) {
    return createError(400, "membership-required");
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

    const membership = await db.projectMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        role: true,
      },
    });

    if (!membership || membership.projectId !== input.projectId) {
      return createError(404, "member-not-found");
    }

    if (membership.userId === actorUserId || membership.role === "owner") {
      return createError(400, "cannot-remove-owner");
    }

    const resolutionResult = await resolveActiveProjectResponsibilities({
      db,
      projectId: input.projectId,
      actor: { kind: "human", id: membership.userId },
      actingUserId: actorUserId,
      resolution: input.responsibilityResolution ?? null,
    });
    if (!resolutionResult.ok) {
      return resolutionResult;
    }

    await db.projectMembership.delete({
      where: { id: membershipId },
    });

    return createSuccess(200, {
      ok: true as const,
      resolvedInventory: resolutionResult.data.inventory,
    });
  });
}

export async function getProjectRoleForActor(input: {
  actorUserId: string;
  projectId: string;
}) {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await getProjectAccess({
      actorUserId,
      projectId: input.projectId,
      db,
    });

    if (!access.ok) {
      return createError(access.status, access.error);
    }

    return createSuccess(200, { role: access.role });
  });
}

export function canManageProjectCollaboration(
  role: ProjectMembershipRole
): boolean {
  return role === "owner";
}

export function canEditProjectContent(role: ProjectMembershipRole): boolean {
  return hasRequiredRole(role, "editor");
}

const MENTION_AUTOCOMPLETE_LIMIT = 8;

export async function searchProjectMembersForMention(input: {
  actorUserId: string;
  agentAccess?: AgentProjectAccessContext;
  projectId: string;
  query: string;
}): Promise<ServiceResult<{ members: ProjectMemberSummary[] }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const query = normalizeSearchQuery(input.query);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const normalizedQuery = query.toLowerCase();
  const queryWithoutTag = normalizedQuery.split("#", 1)[0] ?? normalizedQuery;
  if (input.agentAccess) {
    if (input.agentAccess.projectId !== input.projectId) {
      return createError(404, "project-not-found");
    }

    const canSearchMembers =
      input.agentAccess.scopes.includes("project:read") ||
      input.agentAccess.scopes.includes("task:read") ||
      input.agentAccess.scopes.includes("task:write");
    if (!canSearchMembers) {
      return createError(403, "forbidden");
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: {
        id: true,
        createdAt: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
            avatarSeed: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                usernameDiscriminator: true,
                avatarSeed: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

    // Build list of all project members, preserving one stable owner row.
    const allMembers: Array<{
      membershipId: string;
      userId: string;
      role: ProjectMembershipRole;
      isOwner: boolean;
      createdAt: Date;
      user: {
        id: string;
        email: string | null;
        name: string | null;
        username: string | null;
        usernameDiscriminator: string | null;
        avatarSeed: string | null;
      };
    }> = [];

    let hasOwnerMembership = false;
    for (const membership of project.memberships) {
      if (membership.userId === project.ownerId) {
        hasOwnerMembership = true;
      }

      allMembers.push({
        membershipId: membership.id,
        userId: membership.userId,
        role: membership.role,
        isOwner: membership.userId === project.ownerId,
        createdAt: membership.createdAt,
        user: membership.user,
      });
    }

    // Older project rows may predate owner memberships; fall back to project.createdAt.
    if (!hasOwnerMembership) {
      allMembers.push({
        membershipId: "",
        userId: project.owner.id,
        role: "owner" as ProjectMembershipRole,
        isOwner: true,
        createdAt: project.createdAt,
        user: project.owner,
      });
    }

    // Filter by query matching username, name, or email. Empty @ opens the member list.
    const filteredMembers = allMembers.filter((member) => {
      if (!input.agentAccess && member.userId === actorUserId) {
        return false;
      }

      if (query.length < 1) {
        return true;
      }

      const usernameMatch = member.user.username
        ?.toLowerCase()
        .startsWith(queryWithoutTag);
      const nameMatch = member.user.name
        ?.toLowerCase()
        .includes(normalizedQuery);
      const emailMatch = member.user.email
        ?.toLowerCase()
        .includes(normalizedQuery);
      return usernameMatch || nameMatch || emailMatch;
    });

    // Sort: exact username#discriminator matches first, then by username
    filteredMembers.sort((a, b) => {
      const aUsername = a.user.username ?? "";
      const bUsername = b.user.username ?? "";
      const aExact = aUsername.toLowerCase() === queryWithoutTag;
      const bExact = bUsername.toLowerCase() === queryWithoutTag;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return aUsername.localeCompare(bUsername);
    });

    const members: ProjectMemberSummary[] = filteredMembers
      .slice(0, MENTION_AUTOCOMPLETE_LIMIT)
      .map((member) => ({
        id: member.userId,
        displayName: buildDisplayName(member.user),
        usernameTag:
          member.user.username && member.user.usernameDiscriminator
            ? `${member.user.username}#${member.user.usernameDiscriminator}`
            : null,
        email: member.user.email,
        avatarSeed: resolveAvatarSeed(member.user.avatarSeed, member.userId),
        membershipId: member.membershipId,
        role: member.role,
        joinedAt: member.createdAt.toISOString(),
        isOwner: member.isOwner,
      }));

    return createSuccess(200, { members });
  });
}
