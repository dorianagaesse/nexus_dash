import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/services/session-service";
import { hashPassword, verifyPassword } from "@/lib/services/password-service";

export const MIN_PASSWORD_LENGTH = 8;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthFailureCode =
  | "invalid-email"
  | "password-too-short"
  | "password-too-long"
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

function normalizeEmail(emailRaw: string): string {
  return emailRaw.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
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

export async function signUpWithEmailPassword(input: {
  emailRaw: string;
  passwordRaw: string;
}): Promise<EmailPasswordAuthResult> {
  const email = normalizeEmail(input.emailRaw);
  if (!validateEmail(email)) {
    return { ok: false, error: "invalid-email" };
  }

  const passwordValidation = validatePasswordLength(input.passwordRaw);
  if (passwordValidation !== "ok") {
    return { ok: false, error: passwordValidation };
  }

  const passwordHash = await hashPassword(input.passwordRaw);

  try {
    const createdUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
      },
    });

    return issueSession(createdUser.id);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "email-in-use" };
    }

    throw error;
  }
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
