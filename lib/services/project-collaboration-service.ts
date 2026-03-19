import { Prisma, ProjectMembershipRole } from "@prisma/client";

import {
  getProjectAccess,
  hasRequiredRole,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import { validateUsernameDiscriminator } from "@/lib/services/account-security-policy";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";

const PROJECT_INVITATION_TTL_DAYS = 14;
const INVITABLE_USER_SEARCH_LIMIT = 8;

export type ProjectCollaboratorRole = Exclude<ProjectMembershipRole, "owner">;

interface ServiceError {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface CollaboratorIdentitySummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  email: string | null;
}

export interface ProjectMemberSummary extends CollaboratorIdentitySummary {
  membershipId: string;
  role: ProjectMembershipRole;
  joinedAt: string;
  isOwner: boolean;
}

export interface ProjectInvitationSummary {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedUserId: string;
  invitedUserDisplayName: string;
  invitedUserUsernameTag: string | null;
  invitedUserEmail: string | null;
  invitedByDisplayName: string;
  invitedByUsernameTag: string | null;
  invitedByEmail: string | null;
  role: ProjectCollaboratorRole;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectSharingSummary {
  projectId: string;
  members: ProjectMemberSummary[];
  pendingInvitations: ProjectInvitationSummary[];
}

function createError(status: number, error: string): ServiceError {
  return { ok: false, status, error };
}

function createSuccess<T>(status: number, data: T): ServiceSuccess<T> {
  return { ok: true, status, data };
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

function normalizeInvitationId(invitationId: string | null | undefined): string {
  if (typeof invitationId !== "string") {
    return "";
  }

  return invitationId.trim();
}

function normalizeSearchQuery(query: string | null | undefined): string {
  if (typeof query !== "string") {
    return "";
  }

  return query.trim();
}

function isCollaboratorRole(role: string): role is ProjectCollaboratorRole {
  return role === "editor" || role === "viewer";
}

function requireCollaboratorRole(
  role: ProjectMembershipRole
): ProjectCollaboratorRole {
  if (!isCollaboratorRole(role)) {
    throw new Error("invalid-project-collaborator-role");
  }

  return role;
}

function buildUsernameTag(
  username: string | null | undefined,
  usernameDiscriminator: string | null | undefined
): string | null {
  if (
    !username ||
    !usernameDiscriminator ||
    !validateUsernameDiscriminator(usernameDiscriminator)
  ) {
    return null;
  }

  return `${username}#${usernameDiscriminator}`;
}

function getEmailLocalPart(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }

  return email.split("@", 1)[0] ?? null;
}

function buildDisplayName(input: {
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  email: string | null;
}): string {
  const usernameTag = buildUsernameTag(
    input.username,
    input.usernameDiscriminator
  );

  return usernameTag ?? input.name ?? getEmailLocalPart(input.email) ?? "Unknown user";
}

function buildIdentitySummary(input: {
  id: string;
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  email: string | null;
}): CollaboratorIdentitySummary {
  return {
    id: input.id,
    displayName: buildDisplayName(input),
    usernameTag: buildUsernameTag(input.username, input.usernameDiscriminator),
    email: input.email,
  };
}

function buildInvitationExpiry(): Date {
  return new Date(
    Date.now() + PROJECT_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
}

function buildPendingInvitationWhere(now: Date) {
  return {
    acceptedAt: null,
    revokedAt: null,
    expiresAt: {
      gt: now,
    },
  } satisfies Prisma.ProjectInvitationWhereInput;
}

async function revokeExpiredInvitationsForUser(input: {
  db: DbClient;
  projectId: string;
  invitedUserId: string;
  now: Date;
}) {
  await input.db.projectInvitation.updateMany({
    where: {
      projectId: input.projectId,
      invitedUserId: input.invitedUserId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        lte: input.now,
      },
    },
    data: {
      revokedAt: input.now,
    },
  });
}

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
          memberships: {
            select: { userId: true },
          },
        },
      }),
      db.projectInvitation.findMany({
        where: {
          projectId: input.projectId,
          ...buildPendingInvitationWhere(now),
        },
        select: {
          invitedUserId: true,
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
      ...pendingInvitations.map((invitation) => invitation.invitedUserId),
    ]);

    const users = await db.user.findMany({
      where: {
        emailVerified: {
          not: null,
        },
        id: {
          notIn: Array.from(excludedUserIds),
        },
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
  invitedUserId: string;
  role: string;
}): Promise<ServiceResult<{ invitation: ProjectInvitationSummary }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const invitedUserId = normalizeActorUserId(input.invitedUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!invitedUserId) {
    return createError(400, "invitee-required");
  }

  if (!isCollaboratorRole(input.role)) {
    return createError(400, "invalid-role");
  }
  const invitedRole = input.role;

  if (invitedUserId === actorUserId) {
    return createError(400, "cannot-invite-self");
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

    await revokeExpiredInvitationsForUser({
      db,
      projectId: input.projectId,
      invitedUserId,
      now,
    });

    const [project, invitedUser, existingMembership, existingInvitation] =
      await Promise.all([
        db.project.findUnique({
          where: { id: input.projectId },
          select: {
            id: true,
            name: true,
          },
        }),
        db.user.findUnique({
          where: { id: invitedUserId },
          select: {
            id: true,
            email: true,
            emailVerified: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
          },
        }),
        db.projectMembership.findUnique({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: invitedUserId,
            },
          },
          select: {
            id: true,
          },
        }),
        db.projectInvitation.findFirst({
          where: {
            projectId: input.projectId,
            invitedUserId,
            ...buildPendingInvitationWhere(now),
          },
          select: {
            id: true,
          },
        }),
      ]);

    if (!project) {
      return createError(404, "project-not-found");
    }

    if (!invitedUser || !invitedUser.emailVerified) {
      return createError(404, "invitee-not-found");
    }

    if (existingMembership) {
      return createError(409, "already-a-member");
    }

    if (existingInvitation) {
      return createError(409, "invitation-already-pending");
    }

    try {
      const invitation = await db.projectInvitation.create({
        data: {
          projectId: input.projectId,
          invitedUserId,
          invitedByUserId: actorUserId,
          role: invitedRole,
          expiresAt: buildInvitationExpiry(),
        },
        select: {
          id: true,
          role: true,
          createdAt: true,
          expiresAt: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedUser: {
            select: {
              id: true,
              email: true,
              name: true,
              username: true,
              usernameDiscriminator: true,
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

      return createSuccess(201, {
        invitation: {
          invitationId: invitation.id,
          projectId: invitation.project.id,
          projectName: invitation.project.name,
          invitedUserId: invitation.invitedUser.id,
          invitedUserDisplayName: buildDisplayName(invitation.invitedUser),
          invitedUserUsernameTag: buildUsernameTag(
            invitation.invitedUser.username,
            invitation.invitedUser.usernameDiscriminator
          ),
          invitedUserEmail: invitation.invitedUser.email,
          invitedByDisplayName: buildDisplayName(invitation.invitedByUser),
          invitedByUsernameTag: buildUsernameTag(
            invitation.invitedByUser.username,
            invitation.invitedByUser.usernameDiscriminator
          ),
          invitedByEmail: invitation.invitedByUser.email,
          role: requireCollaboratorRole(invitation.role),
          createdAt: invitation.createdAt.toISOString(),
          expiresAt: invitation.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return createError(409, "invitation-already-pending");
      }

      throw error;
    }
  });
}

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
              },
            },
          },
        },
        invitations: {
          where: buildPendingInvitationWhere(now),
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            role: true,
            createdAt: true,
            expiresAt: true,
            invitedUser: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                usernameDiscriminator: true,
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
        },
      },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

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
      pendingInvitations: project.invitations.map((invitation) => ({
        invitationId: invitation.id,
        projectId: project.id,
        projectName: project.name,
        invitedUserId: invitation.invitedUser.id,
        invitedUserDisplayName: buildDisplayName(invitation.invitedUser),
        invitedUserUsernameTag: buildUsernameTag(
          invitation.invitedUser.username,
          invitation.invitedUser.usernameDiscriminator
        ),
        invitedUserEmail: invitation.invitedUser.email,
        invitedByDisplayName: buildDisplayName(invitation.invitedByUser),
        invitedByUsernameTag: buildUsernameTag(
          invitation.invitedByUser.username,
          invitation.invitedByUser.usernameDiscriminator
        ),
        invitedByEmail: invitation.invitedByUser.email,
        role: requireCollaboratorRole(invitation.role),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    });
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
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return createError(404, "invitation-not-found");
    }

    return createSuccess(200, { ok: true as const });
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
}): Promise<ServiceResult<{ ok: true }>> {
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

    await db.projectMembership.delete({
      where: { id: membershipId },
    });

    return createSuccess(200, { ok: true as const });
  });
}

export async function listPendingProjectInvitationsForUser(
  actorUserId: string
): Promise<ServiceResult<{ invitations: ProjectInvitationSummary[] }>> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const now = new Date();

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const invitations = await db.projectInvitation.findMany({
      where: {
        invitedUserId: normalizedActorUserId,
        ...buildPendingInvitationWhere(now),
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedUser: {
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            usernameDiscriminator: true,
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

    return createSuccess(200, {
      invitations: invitations.map((invitation) => ({
        invitationId: invitation.id,
        projectId: invitation.project.id,
        projectName: invitation.project.name,
        invitedUserId: invitation.invitedUser.id,
        invitedUserDisplayName: buildDisplayName(invitation.invitedUser),
        invitedUserUsernameTag: buildUsernameTag(
          invitation.invitedUser.username,
          invitation.invitedUser.usernameDiscriminator
        ),
        invitedUserEmail: invitation.invitedUser.email,
        invitedByDisplayName: buildDisplayName(invitation.invitedByUser),
        invitedByUsernameTag: buildUsernameTag(
          invitation.invitedByUser.username,
          invitation.invitedByUser.usernameDiscriminator
        ),
        invitedByEmail: invitation.invitedByUser.email,
        role: requireCollaboratorRole(invitation.role),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
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

  const now = new Date();

  return withActorRlsContext(normalizedActorUserId, (db) =>
    db.projectInvitation.count({
      where: {
        invitedUserId: normalizedActorUserId,
        ...buildPendingInvitationWhere(now),
      },
    })
  );
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
        emailVerified: true,
      },
    });

    if (!actor?.emailVerified) {
      return createError(403, "email-unverified");
    }

    const invitation = await db.projectInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        projectId: true,
        role: true,
        invitedUserId: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!invitation || invitation.invitedUserId !== actorUserId) {
      return createError(404, "invitation-not-found");
    }

    if (invitation.acceptedAt) {
      return createError(409, "invitation-already-accepted");
    }

    if (invitation.revokedAt) {
      return createError(409, "invitation-revoked");
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      await db.projectInvitation.updateMany({
        where: {
          id: invitation.id,
          revokedAt: null,
          acceptedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return createError(409, "invitation-expired");
    }

    if (input.decision === "decline") {
      await db.projectInvitation.update({
        where: { id: invitation.id },
        data: {
          revokedAt: new Date(),
        },
      });

      return createSuccess(200, { projectId: invitation.projectId });
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

    if (!existingMembership) {
      await db.projectMembership.create({
        data: {
          projectId: invitation.projectId,
          userId: actorUserId,
          role: requireCollaboratorRole(invitation.role),
        },
      });
    }

    await db.projectInvitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: new Date(),
      },
    });

    return createSuccess(200, { projectId: invitation.projectId });
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

export function canManageProjectCollaboration(role: ProjectMembershipRole): boolean {
  return role === "owner";
}

export function canEditProjectContent(role: ProjectMembershipRole): boolean {
  return hasRequiredRole(role, "editor");
}
