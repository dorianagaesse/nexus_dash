import { createHash, randomBytes } from "node:crypto";

import { getRuntimeEnvironment } from "@/lib/env.server";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  validateEmail,
  validatePasswordLength,
  validatePasswordRequirements,
} from "@/lib/services/account-security-policy";
import { hashPassword } from "@/lib/services/password-service";
import { sendTransactionalEmail } from "@/lib/services/transactional-email-service";

export const PASSWORD_RESET_PATH = "/reset-password";
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;
export const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_RESEND_DAILY_LIMIT = 5;
export const PASSWORD_RESET_RETRY_COOKIE_NAME = "nexusdash.reset-token";
export const PASSWORD_RESET_RETRY_COOKIE_TTL_SECONDS = 10 * 60;

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_MIN_RESPONSE_MS = 350;
const DEFAULT_APP_ORIGIN = "http://localhost:3000";

interface ServiceSuccess<T extends Record<string, unknown>> {
  ok: true;
  status: number;
  data: T;
}

interface ServiceFailure {
  ok: false;
  status: number;
  error: string;
}

type ServiceResult<T extends Record<string, unknown>> =
  | ServiceSuccess<T>
  | ServiceFailure;

interface RequestPasswordResetInput {
  emailRaw: string;
  requestOrigin: string;
}

interface ResetPasswordInput {
  rawToken: string;
  newPasswordRaw: string;
  newPasswordConfirmationRaw: string;
}

function createSuccess<T extends Record<string, unknown>>(
  status: number,
  data: T
): ServiceSuccess<T> {
  return {
    ok: true,
    status,
    data,
  };
}

function createError(status: number, error: string): ServiceFailure {
  return {
    ok: false,
    status,
    error,
  };
}

function normalizeToken(rawToken: string | null | undefined): string {
  if (typeof rawToken !== "string") {
    return "";
  }

  return rawToken.trim();
}

function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}

function createResetToken(): string {
  return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
}

function resolveAppOrigin(requestOrigin: string): string {
  try {
    const parsed = new URL(requestOrigin);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== "null"
    ) {
      return parsed.origin;
    }
  } catch {
    // Fall back below.
  }

  return DEFAULT_APP_ORIGIN;
}

function buildPasswordResetUrl(requestOrigin: string, rawToken: string): string {
  const appOrigin = resolveAppOrigin(requestOrigin);
  const url = new URL(PASSWORD_RESET_PATH, appOrigin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatExpiryLabel(tokenTtlSeconds: number): string {
  const ttlMinutes = Math.floor(tokenTtlSeconds / 60);
  if (ttlMinutes < 60) {
    return `${ttlMinutes} minute${ttlMinutes === 1 ? "" : "s"}`;
  }

  const ttlHours = Math.floor(ttlMinutes / 60);
  return `${ttlHours} hour${ttlHours === 1 ? "" : "s"}`;
}

function buildPasswordResetEmail(input: {
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const expiryLabel = formatExpiryLabel(PASSWORD_RESET_TOKEN_TTL_SECONDS);
  const safeResetUrl = escapeHtmlAttribute(input.resetUrl);

  const subject = "Reset your NexusDash password";
  const text =
    `A password reset was requested for your NexusDash account.\n\n` +
    `This link expires in ${expiryLabel}.\n\n` +
    `${input.resetUrl}\n\n` +
    `If you did not request this, you can ignore this email.`;

  const html =
    `<p>A password reset was requested for your NexusDash account.</p>` +
    `<p>This link expires in <strong>${expiryLabel}</strong>.</p>` +
    `<p><a href="${safeResetUrl}">Reset password</a></p>` +
    `<p>If you did not request this, you can ignore this email.</p>`;

  return { subject, text, html };
}

function isTokenExpired(token: { consumedAt: Date | null; expiresAt: Date }): boolean {
  return Boolean(token.consumedAt) || token.expiresAt.getTime() <= Date.now();
}

async function withMinimumResponseDuration<T>(
  startedAtMs: number,
  value: T
): Promise<T> {
  if (getRuntimeEnvironment() === "test") {
    return value;
  }

  const elapsedMs = Date.now() - startedAtMs;
  const remainingMs = PASSWORD_RESET_MIN_RESPONSE_MS - elapsedMs;
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }

  return value;
}

export async function requestPasswordResetForEmail(
  input: RequestPasswordResetInput
): Promise<
  ServiceResult<{
    delivery: "sent" | "skipped";
  }>
> {
  const startedAtMs = Date.now();
  const email = normalizeEmail(input.emailRaw);
  if (!validateEmail(email)) {
    return withMinimumResponseDuration(
      startedAtMs,
      createSuccess(202, {
        delivery: "skipped",
      })
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) {
    return withMinimumResponseDuration(
      startedAtMs,
      createSuccess(202, {
        delivery: "skipped",
      })
    );
  }

  const now = Date.now();
  const resendWindowFloor = new Date(now - PASSWORD_RESET_RESEND_WINDOW_MS);
  const rawToken = createResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(now + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000);

  const tokenCreationResult = await prisma.$transaction(async (tx) => {
    const [recentTokenCount, latestToken] = await Promise.all([
      tx.passwordResetToken.count({
        where: {
          userId: user.id,
          createdAt: {
            gte: resendWindowFloor,
          },
        },
      }),
      tx.passwordResetToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      }),
    ]);

    if (recentTokenCount >= PASSWORD_RESET_RESEND_DAILY_LIMIT) {
      return createError(429, "reset-limit-reached");
    }

    if (latestToken) {
      const elapsedMs = now - latestToken.createdAt.getTime();
      const cooldownMs = PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        return createError(429, "reset-cooldown");
      }
    }

    const createdToken = await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        email,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
      },
    });

    return createSuccess(202, {
      tokenId: createdToken.id,
    });
  });

  if (!tokenCreationResult.ok) {
    return withMinimumResponseDuration(startedAtMs, tokenCreationResult);
  }

  const resetUrl = buildPasswordResetUrl(input.requestOrigin, rawToken);
  const message = buildPasswordResetEmail({ resetUrl });
  const deliveryResult = await sendTransactionalEmail({
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (!deliveryResult.ok) {
    await prisma.passwordResetToken.deleteMany({
      where: { id: tokenCreationResult.data.tokenId },
    });
    return withMinimumResponseDuration(
      startedAtMs,
      createError(503, "password-reset-email-send-failed")
    );
  }

  return withMinimumResponseDuration(
    startedAtMs,
    createSuccess(202, {
      delivery: deliveryResult.delivery,
    })
  );
}

export async function validatePasswordResetToken(
  rawTokenInput: string
): Promise<ServiceResult<{ userId: string }>> {
  const rawToken = normalizeToken(rawTokenInput);
  if (!rawToken) {
    return createError(400, "invalid-token");
  }

  const tokenHash = hashResetToken(rawToken);
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      email: true,
      consumedAt: true,
      expiresAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!token) {
    return createError(400, "invalid-token");
  }

  if (isTokenExpired(token)) {
    return createError(400, "token-expired");
  }

  const userEmail = normalizeEmail(token.user.email ?? "");
  if (!validateEmail(userEmail) || userEmail !== token.email) {
    return createError(400, "token-expired");
  }

  return createSuccess(200, {
    userId: token.userId,
  });
}

export async function resetPasswordWithToken(
  input: ResetPasswordInput
): Promise<ServiceResult<{ userId: string; sessionsRevoked: boolean }>> {
  const rawToken = normalizeToken(input.rawToken);
  if (!rawToken) {
    return createError(400, "invalid-token");
  }

  const passwordLengthValidation = validatePasswordLength(input.newPasswordRaw);
  if (passwordLengthValidation !== "ok") {
    return createError(400, passwordLengthValidation);
  }

  if (!validatePasswordRequirements(input.newPasswordRaw)) {
    return createError(400, "password-requirements-not-met");
  }

  if (input.newPasswordRaw !== input.newPasswordConfirmationRaw) {
    return createError(400, "password-confirmation-mismatch");
  }

  const tokenHash = hashResetToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        email: true,
        consumedAt: true,
        expiresAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!token) {
      return createError(400, "invalid-token");
    }

    if (isTokenExpired(token)) {
      return createError(400, "token-expired");
    }

    const userEmail = normalizeEmail(token.user.email ?? "");
    if (!validateEmail(userEmail) || userEmail !== token.email) {
      return createError(400, "token-expired");
    }

    const consumeResult = await tx.passwordResetToken.updateMany({
      where: {
        id: token.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    if (consumeResult.count !== 1) {
      return createError(400, "invalid-token");
    }

    const newPasswordHash = await hashPassword(input.newPasswordRaw);

    await tx.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    await Promise.all([
      tx.session.deleteMany({
        where: {
          userId: token.userId,
        },
      }),
      tx.passwordResetToken.updateMany({
        where: {
          userId: token.userId,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      }),
    ]);

    return createSuccess(200, {
      userId: token.userId,
      sessionsRevoked: true,
    });
  });
}
