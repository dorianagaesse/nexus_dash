import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { normalizeEmail, validateEmail } from "@/lib/services/account-security-policy";
import { sendTransactionalEmail } from "@/lib/services/transactional-email-service";

export const EMAIL_VERIFICATION_CALLBACK_PATH = "/api/auth/verify-email";
export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_VERIFICATION_RESEND_DAILY_LIMIT = 5;

const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
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

interface IssueVerificationInput {
  actorUserId: string;
  requestOrigin: string;
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

function normalizeUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string") {
    return "";
  }

  return userId.trim();
}

function normalizeToken(rawToken: string | null | undefined): string {
  if (typeof rawToken !== "string") {
    return "";
  }

  return rawToken.trim();
}

function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}

function createVerificationToken(): string {
  return randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
}

function resolveAppOrigin(requestOrigin: string): string {
  try {
    const parsed = new URL(requestOrigin);
    return parsed.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

function buildVerificationUrl(requestOrigin: string, rawToken: string): string {
  const appOrigin = resolveAppOrigin(requestOrigin);
  const url = new URL(EMAIL_VERIFICATION_CALLBACK_PATH, appOrigin);
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

function buildVerificationEmail(input: {
  verificationUrl: string;
}): { subject: string; text: string; html: string } {
  const expiryLabel = formatExpiryLabel(EMAIL_VERIFICATION_TOKEN_TTL_SECONDS);
  const safeVerificationUrl = escapeHtmlAttribute(input.verificationUrl);

  const subject = "Verify your NexusDash email";
  const text =
    `Verify your email to unlock your NexusDash workspace.\n\n` +
    `This link expires in ${expiryLabel}.\n\n` +
    `${input.verificationUrl}\n\n` +
    `If you did not request this, you can ignore this email.`;

  const html =
    `<p>Verify your email to unlock your NexusDash workspace.</p>` +
    `<p>This link expires in <strong>${expiryLabel}</strong>.</p>` +
    `<p><a href="${safeVerificationUrl}">Verify email</a></p>` +
    `<p>If you did not request this, you can ignore this email.</p>`;

  return { subject, text, html };
}

export async function getEmailVerificationStatus(actorUserId: string): Promise<
  ServiceResult<{
    email: string | null;
    isVerified: boolean;
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
      emailVerified: true,
    },
  });

  if (!user) {
    return createError(404, "user-not-found");
  }

  return createSuccess(200, {
    email: user.email ?? null,
    isVerified: Boolean(user.emailVerified),
  });
}

export async function isEmailVerifiedForUser(actorUserId: string): Promise<boolean> {
  const status = await getEmailVerificationStatus(actorUserId);
  return status.ok && status.data.isVerified;
}

export async function issueEmailVerificationForUser(
  input: IssueVerificationInput
): Promise<
  ServiceResult<{
    expiresAt: Date;
    delivery: "sent" | "skipped";
  }>
> {
  const normalizedActorUserId = normalizeUserId(input.actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedActorUserId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
    },
  });

  if (!user) {
    return createError(404, "user-not-found");
  }

  if (user.emailVerified) {
    return createError(409, "already-verified");
  }

  const email = normalizeEmail(user.email ?? "");
  if (!validateEmail(email)) {
    return createError(400, "email-unavailable");
  }

  const now = Date.now();
  const resendWindowFloor = new Date(now - EMAIL_VERIFICATION_RESEND_WINDOW_MS);

  const rawToken = createVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = new Date(now + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000);
  const verificationUrl = buildVerificationUrl(input.requestOrigin, rawToken);
  const message = buildVerificationEmail({ verificationUrl });
  const tokenCreationResult = await prisma.$transaction(async (tx) => {
    const [recentTokenCount, latestToken] = await Promise.all([
      tx.emailVerificationToken.count({
        where: {
          userId: normalizedActorUserId,
          createdAt: {
            gte: resendWindowFloor,
          },
        },
      }),
      tx.emailVerificationToken.findFirst({
        where: { userId: normalizedActorUserId },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      }),
    ]);

    if (recentTokenCount >= EMAIL_VERIFICATION_RESEND_DAILY_LIMIT) {
      return createError(429, "resend-limit-reached");
    }

    if (latestToken) {
      const elapsedMs = now - latestToken.createdAt.getTime();
      const cooldownMs = EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        return createError(429, "resend-cooldown");
      }
    }

    const createdToken = await tx.emailVerificationToken.create({
      data: {
        userId: normalizedActorUserId,
        email,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return createSuccess(202, {
      tokenId: createdToken.id,
      expiresAt: createdToken.expiresAt,
    });
  });

  if (!tokenCreationResult.ok) {
    return tokenCreationResult;
  }

  const deliveryResult = await sendTransactionalEmail({
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (!deliveryResult.ok) {
    await prisma.emailVerificationToken.deleteMany({
      where: { id: tokenCreationResult.data.tokenId },
    });

    return createError(503, "verification-email-send-failed");
  }

  return createSuccess(202, {
    expiresAt: tokenCreationResult.data.expiresAt,
    delivery: deliveryResult.delivery,
  });
}

export async function consumeEmailVerificationToken(
  rawTokenInput: string
): Promise<ServiceResult<{ userId: string }>> {
  const rawToken = normalizeToken(rawTokenInput);
  if (!rawToken) {
    return createError(400, "invalid-token");
  }

  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const token = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        email: true,
        expiresAt: true,
        consumedAt: true,
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

    if (token.consumedAt || token.expiresAt.getTime() <= now.getTime()) {
      return createError(400, "token-expired");
    }

    const userEmail = normalizeEmail(token.user.email ?? "");
    if (!validateEmail(userEmail) || userEmail !== token.email) {
      return createError(400, "token-expired");
    }

    const consumeResult = await tx.emailVerificationToken.updateMany({
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

    await tx.user.update({
      where: { id: token.userId },
      data: {
        emailVerified: now,
      },
    });

    return createSuccess(200, {
      userId: token.userId,
    });
  });
}
