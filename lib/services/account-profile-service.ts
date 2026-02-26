import { prisma } from "@/lib/prisma";
import {
  generateUsernameDiscriminator,
  normalizeUsername,
  validatePasswordLength,
  validatePasswordRequirements,
  validateUsername,
} from "@/lib/services/account-security-policy";
import { hashPassword, verifyPassword } from "@/lib/services/password-service";
import { deleteAllOtherSessionsForUser } from "@/lib/services/session-service";

interface AccountProfileSuccess<T extends Record<string, unknown>> {
  ok: true;
  status: number;
  data: T;
}

interface AccountProfileError {
  ok: false;
  status: number;
  error: string;
}

type AccountProfileResult<T extends Record<string, unknown>> =
  | AccountProfileSuccess<T>
  | AccountProfileError;

interface UpdateUsernameInput {
  actorUserId: string;
  usernameRaw: string;
  subjectUserId?: string;
}

interface UpdatePasswordInput {
  actorUserId: string;
  currentPasswordRaw: string;
  newPasswordRaw: string;
  newPasswordConfirmationRaw: string;
  currentSessionToken: string | null;
  subjectUserId?: string;
}

const MAX_USERNAME_UPDATE_ATTEMPTS = 12;

function normalizeUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string") {
    return "";
  }

  return userId.trim();
}

function buildUsernameTag(
  username: string | null | undefined,
  usernameDiscriminator: string | null | undefined
): string | null {
  if (!username || !usernameDiscriminator) {
    return null;
  }

  return `${username}#${usernameDiscriminator}`;
}

function createError(status: number, error: string): AccountProfileError {
  return {
    ok: false,
    status,
    error,
  };
}

function createSuccess<T extends Record<string, unknown>>(
  status: number,
  data: T
): AccountProfileSuccess<T> {
  return {
    ok: true,
    status,
    data,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: unknown }).code === "P2002";
}

function readUniqueConstraintTargets(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const candidate = error as {
    meta?: {
      target?: string[] | string;
    };
  };

  const targets = candidate.meta?.target;
  if (Array.isArray(targets)) {
    return targets.filter((target): target is string => typeof target === "string");
  }

  if (typeof targets === "string") {
    return [targets];
  }

  return [];
}

function isUsernameDiscriminatorConstraint(error: unknown): boolean {
  const targets = readUniqueConstraintTargets(error);
  return (
    targets.length > 0 &&
    targets.includes("username") &&
    targets.includes("usernameDiscriminator")
  );
}

function isUnauthorizedOrForbidden(
  actorUserId: string,
  subjectUserId?: string
): AccountProfileError | null {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const normalizedSubjectUserId = normalizeUserId(subjectUserId);
  if (normalizedSubjectUserId && normalizedSubjectUserId !== normalizedActorUserId) {
    return createError(403, "forbidden");
  }

  return null;
}

export async function getAccountProfile(
  actorUserId: string
): Promise<
  AccountProfileResult<{
    email: string | null;
    username: string;
    usernameDiscriminator: string | null;
    usernameTag: string | null;
  }>
> {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedActorUserId },
    select: {
      email: true,
      username: true,
      usernameDiscriminator: true,
    },
  });

  if (!user) {
    return createError(404, "profile-not-found");
  }

  return createSuccess(200, {
    email: user.email ?? null,
    username: user.username ?? "",
    usernameDiscriminator: user.usernameDiscriminator ?? null,
    usernameTag: buildUsernameTag(user.username, user.usernameDiscriminator),
  });
}

export async function updateAccountUsername(
  input: UpdateUsernameInput
): Promise<
  AccountProfileResult<{
    username: string;
    usernameDiscriminator: string;
    usernameTag: string;
    discriminatorRegenerated: boolean;
  }>
> {
  const authError = isUnauthorizedOrForbidden(input.actorUserId, input.subjectUserId);
  if (authError) {
    return authError;
  }

  const actorUserId = normalizeUserId(input.actorUserId);
  const normalizedUsername = normalizeUsername(input.usernameRaw);

  if (!validateUsername(normalizedUsername)) {
    return createError(400, "invalid-username");
  }

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      username: true,
      usernameDiscriminator: true,
    },
  });

  if (!user) {
    return createError(401, "unauthorized");
  }

  let usernameDiscriminator = user.usernameDiscriminator ?? generateUsernameDiscriminator();
  let regenerated = !user.usernameDiscriminator;

  // Keep the current discriminator on first attempt to preserve identity continuity.
  for (let attempt = 0; attempt < MAX_USERNAME_UPDATE_ATTEMPTS; attempt += 1) {
    try {
      const updatedUser = await prisma.user.update({
        where: { id: actorUserId },
        data: {
          username: normalizedUsername,
          usernameDiscriminator,
          name: normalizedUsername,
        },
        select: {
          username: true,
          usernameDiscriminator: true,
        },
      });

      return createSuccess(200, {
        username: updatedUser.username ?? normalizedUsername,
        usernameDiscriminator:
          updatedUser.usernameDiscriminator ?? usernameDiscriminator,
        usernameTag:
          buildUsernameTag(
            updatedUser.username ?? normalizedUsername,
            updatedUser.usernameDiscriminator ?? usernameDiscriminator
          ) ?? `${normalizedUsername}#${usernameDiscriminator}`,
        discriminatorRegenerated: regenerated,
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error) || !isUsernameDiscriminatorConstraint(error)) {
        throw error;
      }

      usernameDiscriminator = generateUsernameDiscriminator();
      regenerated = true;
    }
  }

  return createError(409, "username-in-use");
}

export async function updateAccountPassword(
  input: UpdatePasswordInput
): Promise<
  AccountProfileResult<{
    sessionsRevoked: boolean;
  }>
> {
  const authError = isUnauthorizedOrForbidden(input.actorUserId, input.subjectUserId);
  if (authError) {
    return authError;
  }

  const actorUserId = normalizeUserId(input.actorUserId);
  const passwordValidation = validatePasswordLength(input.newPasswordRaw);
  if (passwordValidation !== "ok") {
    return createError(400, passwordValidation);
  }

  if (!validatePasswordRequirements(input.newPasswordRaw)) {
    return createError(400, "password-requirements-not-met");
  }

  if (input.newPasswordRaw !== input.newPasswordConfirmationRaw) {
    return createError(400, "password-confirmation-mismatch");
  }

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) {
    return createError(400, "invalid-current-password");
  }

  const currentPasswordMatches = await verifyPassword(
    input.currentPasswordRaw,
    user.passwordHash
  );
  if (!currentPasswordMatches) {
    return createError(400, "invalid-current-password");
  }

  const newPasswordHash = await hashPassword(input.newPasswordRaw);

  await prisma.user.update({
    where: { id: actorUserId },
    data: {
      passwordHash: newPasswordHash,
    },
  });

  await deleteAllOtherSessionsForUser(actorUserId, input.currentSessionToken);

  return createSuccess(200, {
    sessionsRevoked: true,
  });
}
