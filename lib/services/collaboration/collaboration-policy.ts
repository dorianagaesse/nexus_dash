import { effectiveProjectCapabilities } from "@/lib/project-capabilities";
// Shared collaboration normalization, identities, invitation states, and response mapping.

import type { Prisma, ProjectMembershipRole } from "@prisma/client";
import { resolveAvatarSeed } from "@/lib/avatar";
import { normalizeReturnToPath } from "@/lib/navigation/return-to";
import {
  normalizeEmail,
  validateUsernameDiscriminator,
} from "@/lib/services/account-security-policy";
import {
  type ProjectCollaboratorRole,
  type ServiceError,
  type ServiceSuccess,
  type CollaboratorIdentitySummary,
  type ProjectInvitationSummary,
  type ProjectInvitationRecipientState,
  type PendingInvitationMetadataRow,
  type InvitationMatchedUser,
  type ProjectInvitationRecord,
} from "./collaboration-types";

const PROJECT_INVITATION_TTL_HOURS = 24;

const PROJECT_INVITATION_PATH_PREFIX = "/invite/project";

export function createError(status: number, error: string): ServiceError {
  return { ok: false, status, error };
}

export function createSuccess<T>(status: number, data: T): ServiceSuccess<T> {
  return { ok: true, status, data };
}

export function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

export function normalizeInvitationId(
  invitationId: string | null | undefined
): string {
  if (typeof invitationId !== "string") {
    return "";
  }

  return invitationId.trim();
}

export function normalizeSearchQuery(query: string | null | undefined): string {
  if (typeof query !== "string") {
    return "";
  }

  return query.trim();
}

export function normalizeInvitationEmail(email: string | null | undefined): string {
  if (typeof email !== "string") {
    return "";
  }

  return normalizeEmail(email);
}

export function isCollaboratorRole(role: string): role is ProjectCollaboratorRole {
  return role === "editor" || role === "viewer";
}

export function requireCollaboratorRole(
  role: ProjectMembershipRole
): ProjectCollaboratorRole {
  if (!isCollaboratorRole(role)) {
    throw new Error("invalid-project-collaborator-role");
  }

  return role;
}

export function isUniqueConstraintError(error: unknown): boolean {
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

export function buildDisplayName(input: {
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  email: string | null;
}): string {
  const usernameTag = buildUsernameTag(
    input.username,
    input.usernameDiscriminator
  );

  return (
    usernameTag ??
    input.name ??
    getEmailLocalPart(input.email) ??
    "Unknown user"
  );
}

export function buildIdentitySummary(input: {
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

export function buildInvitationExpiry(): Date {
  return new Date(
    Date.now() + PROJECT_INVITATION_TTL_HOURS * 60 * 60 * 1000
  );
}

function buildProjectInvitationPath(invitationId: string): string {
  const normalizedInvitationId = normalizeInvitationId(invitationId);
  return `${PROJECT_INVITATION_PATH_PREFIX}/${encodeURIComponent(normalizedInvitationId)}`;
}

export function buildAbsoluteProjectInvitationUrl(
  appOrigin: string | null | undefined,
  invitation: ProjectInvitationSummary
): string | null {
  if (typeof appOrigin !== "string" || !appOrigin.trim()) {
    return null;
  }

  let safeOrigin: string;
  try {
    const parsedOrigin = new URL(appOrigin);
    if (
      (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
      parsedOrigin.origin === "null"
    ) {
      return null;
    }
    safeOrigin = parsedOrigin.origin;
  } catch {
    return null;
  }

  return new URL(invitation.inviteLinkPath, safeOrigin).toString();
}

export function buildProjectInvitationReturnToPath(
  invitationId: string
): string {
  return normalizeReturnToPath(buildProjectInvitationPath(invitationId));
}

export function buildPendingInvitationWhere(now: Date) {
  return {
    acceptedAt: null,
    revokedAt: null,
    replacedAt: null,
    expiresAt: {
      gt: now,
    },
  } satisfies Prisma.ProjectInvitationWhereInput;
}

export function buildInvitationTerminalState(
  invitation: Pick<
    ProjectInvitationRecord,
    "acceptedAt" | "revokedAt" | "replacedAt" | "expiresAt"
  >
): Exclude<
  ProjectInvitationRecipientState,
  | "sign-in-required"
  | "wrong-account"
  | "verification-required"
  | "accept-ready"
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

export function buildProjectInvitationSummary(input: {
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
    "id" in input.invitation
      ? input.invitation.id
      : input.invitation.invitationId;
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
    ...("capabilities" in input.invitation && input.invitation.capabilities != null ? { capabilities: effectiveProjectCapabilities(invitationRole, input.invitation.capabilities) } : {}),
    inviteLinkPath: buildProjectInvitationPath(invitationId),
  } satisfies ProjectInvitationSummary;
}
