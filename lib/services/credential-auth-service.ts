import { randomInt } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/services/session-service";
import { hashPassword, verifyPassword } from "@/lib/services/password-service";

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const USERNAME_DISCRIMINATOR_LENGTH = 6;

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 128;
const MAX_USERNAME_GENERATION_ATTEMPTS = 12;
const USERNAME_DISCRIMINATOR_SPACE = 36 ** USERNAME_DISCRIMINATOR_LENGTH;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9._]+$/;

type AuthFailureCode =
  | "invalid-email"
  | "invalid-username"
  | "password-too-short"
  | "password-too-long"
  | "password-confirmation-mismatch"
  | "email-in-use"
  | "invalid-credentials";

interface AuthSuccess {
  ok: true;
  data: {
    userId: string;
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

function normalizeEmail(emailRaw: string): string {
  return emailRaw.trim().toLowerCase();
}

function normalizeUsername(usernameRaw: string): string {
  return usernameRaw.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

function validateUsername(username: string): boolean {
  return (
    username.length >= MIN_USERNAME_LENGTH &&
    username.length <= MAX_USERNAME_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

function validatePasswordLength(
  password: string
): "ok" | "password-too-short" | "password-too-long" {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "password-too-short";
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return "password-too-long";
  }

  return "ok";
}

async function issueSession(userId: string): Promise<AuthSuccess> {
  const session = await createSessionForUser(userId);
  return {
    ok: true,
    data: {
      userId,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
    },
  };
}

function generateUsernameDiscriminator(): string {
  return randomInt(0, USERNAME_DISCRIMINATOR_SPACE)
    .toString(36)
    .padStart(USERNAME_DISCRIMINATOR_LENGTH, "0");
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
        },
      });

      return issueSession(createdUser.id);
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
    },
  });

  if (!user?.passwordHash) {
    return { ok: false, error: "invalid-credentials" };
  }

  const passwordMatches = await verifyPassword(input.passwordRaw, user.passwordHash);
  if (!passwordMatches) {
    return { ok: false, error: "invalid-credentials" };
  }

  return issueSession(user.id);
}
