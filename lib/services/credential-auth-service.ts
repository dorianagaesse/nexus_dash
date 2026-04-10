import { AuthRateLimitScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logServerWarning } from "@/lib/observability/logger";
import {
  buildAuthRateLimitKey,
  buildCompositeAuthRateLimitKey,
  checkAuthAbuseControls,
  clearAuthAbuseControls,
  consumeAuthAbuseQuota,
  registerAuthAbuseFailure,
  type AuthAbuseSignal,
} from "@/lib/services/auth-abuse-control-service";
import { isPreviewDeployment } from "@/lib/env.server";
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
const MAX_IP_ADDRESS_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;

type AuthFailureCode =
  | "invalid-email"
  | "invalid-username"
  | "username-in-use"
  | "password-too-short"
  | "password-too-long"
  | "password-requirements-not-met"
  | "password-confirmation-mismatch"
  | "email-in-use"
  | "invalid-credentials"
  | "too-many-attempts";

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

function normalizeTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeBoundedString(
  value: string | null | undefined,
  maxLength: number
): string | null {
  const trimmedValue = normalizeTrimmedString(value);
  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function buildSignInSignals(input: {
  email: string;
  ipAddress?: string | null;
}): AuthAbuseSignal[] {
  const signals: AuthAbuseSignal[] = [];
  const ipKey = buildAuthRateLimitKey("sign-in:ip", input.ipAddress);
  const emailKey = buildAuthRateLimitKey("sign-in:email", input.email);
  const ipEmailKey = buildCompositeAuthRateLimitKey("sign-in:ip-email", [
    input.ipAddress ?? null,
    input.email,
  ]);

  if (ipKey) {
    signals.push({
      key: ipKey,
      maxAttempts: 12,
      windowMs: FIFTEEN_MINUTES_MS,
      blockMs: FIFTEEN_MINUTES_MS,
    });
  }

  if (emailKey) {
    signals.push({
      key: emailKey,
      maxAttempts: 8,
      windowMs: FIFTEEN_MINUTES_MS,
      blockMs: THIRTY_MINUTES_MS,
    });
  }

  if (ipEmailKey) {
    signals.push({
      key: ipEmailKey,
      maxAttempts: 5,
      windowMs: FIFTEEN_MINUTES_MS,
      blockMs: THIRTY_MINUTES_MS,
    });
  }

  return signals;
}

function buildSignUpSignals(input: {
  email: string;
  ipAddress?: string | null;
}): AuthAbuseSignal[] {
  const signals: AuthAbuseSignal[] = [];
  const ipKey = buildAuthRateLimitKey("sign-up:ip", input.ipAddress);
  const emailKey = buildAuthRateLimitKey("sign-up:email", input.email);
  const ipEmailKey = buildCompositeAuthRateLimitKey("sign-up:ip-email", [
    input.ipAddress ?? null,
    input.email,
  ]);

  if (ipKey) {
    signals.push({
      key: ipKey,
      maxAttempts: 8,
      windowMs: THIRTY_MINUTES_MS,
      blockMs: THIRTY_MINUTES_MS,
    });
  }

  if (emailKey) {
    signals.push({
      key: emailKey,
      maxAttempts: 5,
      windowMs: THIRTY_MINUTES_MS,
      blockMs: THIRTY_MINUTES_MS,
    });
  }

  if (ipEmailKey) {
    signals.push({
      key: ipEmailKey,
      maxAttempts: 4,
      windowMs: THIRTY_MINUTES_MS,
      blockMs: THIRTY_MINUTES_MS,
    });
  }

  return signals;
}

async function resolveSignInFailure(input: {
  email: string;
  ipAddress?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
  reason: string;
}): Promise<AuthFailure> {
  const signals = buildSignInSignals({
    email: input.email,
    ipAddress: input.ipAddress,
  });
  const abuseResult = await registerAuthAbuseFailure({
    scope: AuthRateLimitScope.sign_in,
    signals,
  });

  logServerWarning("credentialAuth.signInFailed", "Email/password sign-in failed.", {
    requestId: input.requestId ?? null,
    ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
    userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
    reason: input.reason,
    accountKey: buildAuthRateLimitKey("sign-in:email", input.email),
    throttled: !abuseResult.ok,
    retryAfterSeconds: abuseResult.ok ? null : abuseResult.retryAfterSeconds,
  });

  return {
    ok: false,
    error: abuseResult.ok ? "invalid-credentials" : "too-many-attempts",
  };
}

export async function signUpWithEmailPassword(input: {
  emailRaw: string;
  usernameRaw: string;
  passwordRaw: string;
  passwordConfirmationRaw: string;
  ipAddress?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
}): Promise<EmailPasswordAuthResult> {
  const email = normalizeEmail(input.emailRaw);
  const abuseSignals = buildSignUpSignals({
    email,
    ipAddress: input.ipAddress,
  });
  const abuseControlResult = await consumeAuthAbuseQuota({
    scope: AuthRateLimitScope.sign_up,
    signals: abuseSignals,
  });
  if (!abuseControlResult.ok) {
    logServerWarning("credentialAuth.signUpThrottled", "Email/password sign-up throttled.", {
      requestId: input.requestId ?? null,
      ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
      userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
      retryAfterSeconds: abuseControlResult.retryAfterSeconds,
    });
    return { ok: false, error: "too-many-attempts" };
  }

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
          emailVerified: isPreviewDeployment() ? new Date() : null,
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

  return { ok: false, error: "username-in-use" };
}

export async function signInWithEmailPassword(input: {
  emailRaw: string;
  passwordRaw: string;
  ipAddress?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
}): Promise<EmailPasswordAuthResult> {
  const email = normalizeEmail(input.emailRaw);
  const abuseSignals = buildSignInSignals({
    email,
    ipAddress: input.ipAddress,
  });
  const abuseCheck = await checkAuthAbuseControls({
    scope: AuthRateLimitScope.sign_in,
    signals: abuseSignals,
  });
  if (!abuseCheck.ok) {
    logServerWarning("credentialAuth.signInThrottled", "Email/password sign-in throttled.", {
      requestId: input.requestId ?? null,
      ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
      userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
      accountKey: buildAuthRateLimitKey("sign-in:email", email),
      retryAfterSeconds: abuseCheck.retryAfterSeconds,
    });
    return { ok: false, error: "too-many-attempts" };
  }

  if (!validateEmail(email)) {
    return resolveSignInFailure({
      email,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      userAgent: input.userAgent,
      reason: "invalid-email",
    });
  }

  const passwordValidation = validatePasswordLength(input.passwordRaw);
  if (passwordValidation !== "ok") {
    return resolveSignInFailure({
      email,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      userAgent: input.userAgent,
      reason: "password-validation-failed",
    });
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
    return resolveSignInFailure({
      email,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      userAgent: input.userAgent,
      reason: "user-not-found",
    });
  }

  const passwordMatches = await verifyPassword(input.passwordRaw, user.passwordHash);
  if (!passwordMatches) {
    return resolveSignInFailure({
      email,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      userAgent: input.userAgent,
      reason: "password-mismatch",
    });
  }

  try {
    await clearAuthAbuseControls({
      scope: AuthRateLimitScope.sign_in,
      keys: abuseSignals.map((signal) => signal.key),
    });
  } catch (error) {
    logServerWarning(
      "credentialAuth.signInAbuseControlsClearFailed",
      "Failed to clear auth abuse controls after successful email/password sign-in.",
      {
        requestId: input.requestId ?? null,
        ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
        userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
        accountKey: buildAuthRateLimitKey("sign-in:email", email),
        userId: user.id,
        error,
      }
    );
  }

  return issueSession({
    userId: user.id,
    emailVerified: Boolean(user.emailVerified),
  });
}
