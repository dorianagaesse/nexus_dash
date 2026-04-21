import { Prisma, ProjectMembershipRole } from "@prisma/client";

import { resolveAvatarSeed } from "@/lib/avatar";
import { normalizeReturnToPath } from "@/lib/navigation/return-to";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  validateEmail,
  validateUsernameDiscriminator,
} from "@/lib/services/account-security-policy";
import {
  getProjectAccess,
  hasRequiredRole,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";

const PROJECT_INVITATION_TTL_DAYS = 14;
const INVITABLE_USER_SEARCH_LIMIT = 8;
const PROJECT_INVITATION_PATH_PREFIX = "/invite/project";

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
  avatarSeed: string;
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
  invitedEmail: string;
  invitedUserId: string | null;
  invitedUserDisplayName: string | null;
  invitedUserUsernameTag: string | null;
  invitedByDisplayName: string;
  invitedByUsernameTag: string | null;
  invitedByEmail: string | null;
  role: ProjectCollaboratorRole;
  createdAt: string;
  expiresAt: string;
  inviteLinkPath: string;
}

export interface ProjectSharingSummary {
  projectId: string;
  members: ProjectMemberSummary[];
  pendingInvitations: ProjectInvitationSummary[];
}

export type ProjectInvitationRecipientState =
  | "not-found"
  | "revoked"
  | "expired"
  | "replaced"
  | "accepted"
  | "sign-in-required"
  | "wrong-account"
  | "verification-required"
  | "accept-ready";

export interface ProjectInvitationRecipientView {
  state: ProjectInvitationRecipientState;
  invitation: ProjectInvitationSummary | null;
  actor: CollaboratorIdentitySummary | null;
  actorEmailVerified: boolean;
  actorEmailMatchesInvitation: boolean;
}

interface PendingInvitationMetadataRow {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedByUserId: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
  invitationRole: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
}

interface InvitationMatchedUser {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
}

interface InvitationRecipientLookupRow {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitationRole: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  replacedAt: Date | null;
  invitedByUserId: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
}

interface ProjectInvitationRecord {
  id: string;
  projectId: string;
  invitedEmail: string;
  role: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  replacedAt: Date | null;
  project: {
    id: string;
    name: string;
  };
  invitedByUser: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
  };
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

function normalizeInvitationEmail(email: string | null | undefined): string {
  if (typeof email !== "string") {
    return "";
  }

  return normalizeEmail(email);
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
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
  avatarSeed?: string | null;
}): CollaboratorIdentitySummary {
  return {
    id: input.id,
    displayName: buildDisplayName(input),
    usernameTag: buildUsernameTag(input.username, input.usernameDiscriminator),
    email: input.email,
    avatarSeed: resolveAvatarSeed(input.avatarSeed, input.id),
  };
}

function buildInvitationExpiry(): Date {
  return new Date(
    Date.now() + PROJECT_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
}

function buildProjectInvitationPath(invitationId: string): string {
  const normalizedInvitationId = normalizeInvitationId(invitationId);
  return `${PROJECT_INVITATION_PATH_PREFIX}/${encodeURIComponent(normalizedInvitationId)}`;
}

export function buildProjectInvitationReturnToPath(
  invitationId: string
): string {
  return normalizeReturnToPath(buildProjectInvitationPath(invitationId));
}

function buildPendingInvitationWhere(now: Date) {
  return {
    acceptedAt: null,
    revokedAt: null,
    replacedAt: null,
    expiresAt: {
      gt: now,
    },
  } satisfies Prisma.ProjectInvitationWhereInput;
}

function buildInvitationTerminalState(
  invitation: Pick<
    ProjectInvitationRecord,
    "acceptedAt" | "revokedAt" | "replacedAt" | "expiresAt"
  >
): Exclude<
  ProjectInvitationRecipientState,
  "sign-in-required" | "wrong-account" | "verification-required" | "accept-ready"
> | null {
  if (invitation.acceptedAt) {
    return "accepted";
  }

  if (invitation.replacedAt) {
    return "replaced";
  }

  if (invitation.revokedAt) {
    return "revoked";
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }

  return null;
}

async function listPendingInvitationMetadataRows(
  db: DbClient
): Promise<PendingInvitationMetadataRow[]> {
  return db.$queryRaw<PendingInvitationMetadataRow[]>(Prisma.sql`
    SELECT
      invitation_id AS "invitationId",
      project_id AS "projectId",
      project_name AS "projectName",
      invited_email AS "invitedEmail",
      invited_by_user_id AS "invitedByUserId",
      invited_by_email AS "invitedByEmail",
      invited_by_name AS "invitedByName",
      invited_by_username AS "invitedByUsername",
      invited_by_username_discriminator AS "invitedByUsernameDiscriminator",
      invitation_role AS "invitationRole",
      created_at AS "createdAt",
      expires_at AS "expiresAt"
    FROM app.list_pending_project_invitations_for_current_user()
  `);
}

async function revokeExpiredInvitationsForEmail(input: {
  db: DbClient;
  projectId: string;
  invitedEmail: string;
  now: Date;
}) {
  await input.db.projectInvitation.updateMany({
    where: {
      projectId: input.projectId,
      invitedEmail: input.invitedEmail,
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      expiresAt: {
        lte: input.now,
      },
    },
    data: {
      revokedAt: input.now,
    },
  });
}

async function getVerifiedUsersByEmail(
  db: DbClient,
  emails: string[]
): Promise<Map<string, InvitationMatchedUser>> {
  const normalizedEmails = Array.from(
    new Set(
      emails
        .map((email) => normalizeInvitationEmail(email))
        .filter((email) => validateEmail(email))
    )
  );

  if (normalizedEmails.length === 0) {
    return new Map<string, InvitationMatchedUser>();
  }

  const users = await db.user.findMany({
    where: {
      emailVerified: {
        not: null,
      },
      email: {
        in: normalizedEmails,
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      usernameDiscriminator: true,
      avatarSeed: true,
    },
  });

  return new Map(
    users
      .filter((user) => user.email)
      .map((user) => [normalizeInvitationEmail(user.email), user])
  );
}

function buildProjectInvitationSummary(input: {
  invitation: ProjectInvitationRecord | PendingInvitationMetadataRow;
  invitedBy: {
    email: string | null;
    name: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
  };
  matchedInvitee: InvitationMatchedUser | null;
}) {
  const invitationId =
    "id" in input.invitation ? input.invitation.id : input.invitation.invitationId;
  const projectName =
    "project" in input.invitation
      ? input.invitation.project.name
      : input.invitation.projectName;
  const invitationRole =
    "role" in input.invitation
      ? input.invitation.role
      : input.invitation.invitationRole;

  return {
    invitationId,
    projectId: input.invitation.projectId,
    projectName,
    invitedEmail: input.invitation.invitedEmail,
    invitedUserId: input.matchedInvitee?.id ?? null,
    invitedUserDisplayName: input.matchedInvitee
      ? buildDisplayName(input.matchedInvitee)
      : null,
    invitedUserUsernameTag: input.matchedInvitee
      ? buildUsernameTag(
          input.matchedInvitee.username,
          input.matchedInvitee.usernameDiscriminator
        )
      : null,
    invitedByDisplayName: buildDisplayName(input.invitedBy),
    invitedByUsernameTag: buildUsernameTag(
      input.invitedBy.username,
      input.invitedBy.usernameDiscriminator
    ),
    invitedByEmail: input.invitedBy.email,
    role: requireCollaboratorRole(invitationRole),
    createdAt: input.invitation.createdAt.toISOString(),
    expiresAt: input.invitation.expiresAt.toISOString(),
    inviteLinkPath: buildProjectInvitationPath(invitationId),
  } satisfies ProjectInvitationSummary;
}

async function findInvitationById(
  invitationId: string
): Promise<ProjectInvitationRecord | null> {
  const rows = await prisma.$queryRaw<InvitationRecipientLookupRow[]>(Prisma.sql`
    SELECT
      invitation_id AS "invitationId",
      project_id AS "projectId",
      project_name AS "projectName",
      invited_email AS "invitedEmail",
      invitation_role AS "invitationRole",
      created_at AS "createdAt",
      expires_at AS "expiresAt",
      accepted_at AS "acceptedAt",
      revoked_at AS "revokedAt",
      replaced_at AS "replacedAt",
      invited_by_user_id AS "invitedByUserId",
      invited_by_email AS "invitedByEmail",
      invited_by_name AS "invitedByName",
      invited_by_username AS "invitedByUsername",
      invited_by_username_discriminator AS "invitedByUsernameDiscriminator"
    FROM app.get_project_invitation_for_landing(${invitationId})
  `);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.invitationId,
    projectId: row.projectId,
    invitedEmail: row.invitedEmail,
    role: row.invitationRole,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    replacedAt: row.replacedAt,
    project: {
      id: row.projectId,
      name: row.projectName,
    },
    invitedByUser: {
      id: row.invitedByUserId,
      email: row.invitedByEmail,
      name: row.invitedByName,
      username: row.invitedByUsername,
      usernameDiscriminator: row.invitedByUsernameDiscriminator,
    },
  };
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
}): Promise<ServiceResult<{ invitation: ProjectInvitationSummary }>> {
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

    await revokeExpiredInvitationsForEmail({
      db,
      projectId: input.projectId,
      invitedEmail,
      now,
    });

    const [project, actor, matchedInvitee, existingMembership] = await Promise.all([
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

    await db.projectInvitation.updateMany({
      where: {
        projectId: input.projectId,
        invitedEmail,
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
      },
      data: {
        replacedAt: now,
      },
    });

    try {
      const invitation = await db.projectInvitation.create({
        data: {
          projectId: input.projectId,
          invitedEmail,
          invitedByUserId: actorUserId,
          role: invitedRole,
          expiresAt: buildInvitationExpiry(),
        },
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

      return createSuccess(201, {
        invitation: buildProjectInvitationSummary({
          invitation,
          invitedBy: invitation.invitedByUser,
          matchedInvitee: matchedInvitee?.emailVerified ? matchedInvitee : null,
        }),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return createError(409, "invitation-conflict");
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
            matchedInvitees.get(normalizeInvitationEmail(invitation.invitedEmail)) ?? null,
        })
      ),
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
        replacedAt: null,
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

    if (invitation.acceptedAt) {
      return createSuccess(200, { projectId: invitation.projectId });
    }

    if (invitation.replacedAt) {
      return createError(409, "invitation-replaced");
    }

    if (invitation.revokedAt) {
      return createError(409, "invitation-revoked");
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
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
        return createError(409, "invitation-already-accepted");
      }

      if (latestInvitation?.replacedAt) {
        return createError(409, "invitation-replaced");
      }

      if (latestInvitation?.revokedAt) {
        return createSuccess(200, { projectId: invitation.projectId });
      }

      if (latestInvitation && latestInvitation.expiresAt.getTime() <= Date.now()) {
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
        return createSuccess(200, { projectId: latestInvitation.projectId });
      }

      if (
        createdMembership &&
        (latestInvitation?.replacedAt ||
          latestInvitation?.revokedAt ||
          (latestInvitation && latestInvitation.expiresAt.getTime() <= Date.now()) ||
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
        return createError(409, "invitation-replaced");
      }

      if (latestInvitation?.revokedAt) {
        return createError(409, "invitation-revoked");
      }

      if (latestInvitation && latestInvitation.expiresAt.getTime() <= Date.now()) {
        return createError(409, "invitation-expired");
      }

      return createError(404, "invitation-not-found");
    }

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

  const matchedInvitees = await getVerifiedUsersByEmail(prisma, [invitation.invitedEmail]);
  const invitationSummary = buildProjectInvitationSummary({
    invitation,
    invitedBy: invitation.invitedByUser,
    matchedInvitee:
      matchedInvitees.get(normalizeInvitationEmail(invitation.invitedEmail)) ?? null,
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
