import crypto from "node:crypto";

import type { Page } from "@playwright/test";

import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "../../../lib/auth/session-constants";
import { prisma } from "../../../lib/prisma";
import {
  hashSessionToken,
} from "../../../lib/services/session-service";

function uniqueSuffix(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function toSafeUsernameBase(rawValue: string): string {
  return rawValue.replace(/[^a-z0-9]/g, "").slice(0, 12) || "e2euser";
}

function toUsernameDiscriminator(rawValue: string): string {
  const normalized = rawValue.replace(/\D/g, "").slice(0, 4);
  return normalized.length === 4 ? normalized : normalized.padStart(4, "0");
}

function resolveBaseUrl(): URL {
  const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
  const fallbackBaseUrl = "http://127.0.0.1:3000";
  return new URL(configuredBaseUrl || fallbackBaseUrl);
}

export async function signInAsVerifiedUser(page: Page): Promise<void> {
  const suffix = uniqueSuffix();
  const usernameBase = toSafeUsernameBase(suffix);
  const usernameDiscriminator = toUsernameDiscriminator(suffix);
  const user = await prisma.user.create({
    data: {
      email: `e2e-${suffix}@nexusdash.local`,
      name: "E2E Smoke User",
      username: usernameBase,
      usernameDiscriminator,
      emailVerified: new Date(),
    },
    select: {
      id: true,
    },
  });

  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: hashSessionToken(sessionToken),
      expires: expiresAt,
    },
  });

  const baseUrl = resolveBaseUrl();
  await page.context().addCookies([
    {
      name: PRIMARY_SESSION_COOKIE_NAME,
      value: sessionToken,
      url: baseUrl.origin,
      httpOnly: true,
      secure: baseUrl.protocol === "https:",
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1000),
    },
  ]);
}
