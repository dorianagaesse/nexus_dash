import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/services/session-service";
import { hashPassword, verifyPassword } from "@/lib/services/password-service";
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_DISCRIMINATOR_LENGTH,
  generateUsernameDiscriminator,
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validatePasswordLength,
  validatePasswordRequirements,
  validateUsername,
} from "@/lib/services/account-security-policy";

export {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_DISCRIMINATOR_LENGTH,
};

const MAX_USERNAME_GENERATION_ATTEMPTS = 12;

type AuthFailureCode =
  | "invalid-email"
  | "invalid-username"
  | "password-too-short"
  | "password-too-long"
  | "password-requirements-not-met"
  | "password-confirmation-mismatch"
  | "email-in-use"
  | "invalid-credentials";

interface AuthSuccess {
  ok: true;
  data: {
    userId: string;
    emailVerified: boolean;
    sessionToken: string;
    expiresAt: Date;
  };
}

interface AuthFailure {
  ok: false;
  error: AuthFailureCode;
}

export type EmailPasswordAuthResult = AuthSuccess | AuthFailure;

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

async function issueSession(input: {
  userId: string;
  emailVerified: boolean;
}): Promise<AuthSuccess> {
  const session = await createSessionForUser(input.userId);
  return {
    ok: true,
    data: {
      userId: input.userId,
      emailVerified: input.emailVerified,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
    },
  };
}

function isEmailUniqueConstraint(error: unknown): boolean {
  const targets = readUniqueConstraintTargets(error);
  return targets.length === 0 || targets.includes("email");
}

function isUsernameDiscriminatorConstraint(error: unknown): boolean {
  const targets = readUniqueConstraintTargets(error);
  return (
    targets.length > 0 &&
    targets.includes("username") &&
    targets.includes("usernameDiscriminator")
  );
}

export async function signUpWithEmailPassword(input: {
  emailRaw: string;
  usernameRaw: string;
  passwordRaw: string;
  passwordConfirmationRaw: string;
}): Promise<EmailPasswordAuthResult> {
  const email = normalizeEmail(input.emailRaw);
  if (!validateEmail(email)) {
    return { ok: false, error: "invalid-email" };
  }

  const username = normalizeUsername(input.usernameRaw);
  if (!validateUsername(username)) {
    return { ok: false, error: "invalid-username" };
  }

  const passwordValidation = validatePasswordLength(input.passwordRaw);
  if (passwordValidation !== "ok") {
    return { ok: false, error: passwordValidation };
  }

  if (!validatePasswordRequirements(input.passwordRaw)) {
    return { ok: false, error: "password-requirements-not-met" };
  }

  if (input.passwordRaw !== input.passwordConfirmationRaw) {
    return { ok: false, error: "password-confirmation-mismatch" };
  }

  const passwordHash = await hashPassword(input.passwordRaw);

  for (let attempt = 0; attempt < MAX_USERNAME_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const createdUser = await prisma.user.create({
        data: {
          email,
          name: username,
          username,
          usernameDiscriminator: generateUsernameDiscriminator(),
          passwordHash,
        },
        select: {
          id: true,
          emailVerified: true,
        },
      });

      return issueSession({
        userId: createdUser.id,
        emailVerified: Boolean(createdUser.emailVerified),
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      if (isEmailUniqueConstraint(error)) {
        return { ok: false, error: "email-in-use" };
      }

      if (isUsernameDiscriminatorConstraint(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `failed-to-generate-unique-discriminator: username=${username}, attempts=${MAX_USERNAME_GENERATION_ATTEMPTS}`
  );
}

export async function signInWithEmailPassword(input: {
  emailRaw: string;
  passwordRaw: string;
}): Promise<EmailPasswordAuthResult> {
  const email = normalizeEmail(input.emailRaw);
  if (!validateEmail(email)) {
    return { ok: false, error: "invalid-email" };
  }

  const passwordValidation = validatePasswordLength(input.passwordRaw);
  if (passwordValidation !== "ok") {
    return { ok: false, error: "invalid-credentials" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
    },
  });

  if (!user?.passwordHash) {
    return { ok: false, error: "invalid-credentials" };
  }

  const passwordMatches = await verifyPassword(input.passwordRaw, user.passwordHash);
  if (!passwordMatches) {
    return { ok: false, error: "invalid-credentials" };
  }

  return issueSession({
    userId: user.id,
    emailVerified: Boolean(user.emailVerified),
  });
}
