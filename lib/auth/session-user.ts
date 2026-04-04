import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import {
  readSessionTokensFromCookieHeader,
  readSessionTokensFromCookieReader,
  resolveSessionUserIdByToken,
} from "@/lib/services/session-service";

interface CookieEnabledRequest {
  cookies?: {
    get(name: string): { value: string } | undefined;
  };
  headers: Headers;
}

async function resolveSessionUserIdFromTokens(
  sessionTokens: string[]
): Promise<string | null> {
  for (const sessionToken of sessionTokens) {
    const userId = await resolveSessionUserIdByToken(sessionToken);
    if (userId) {
      return userId;
    }
  }

  return null;
}

function shouldUseSyntheticTestUser(): boolean {
  if (process.env.ENABLE_SYNTHETIC_TEST_USER === "1") {
    return true;
  }

  return process.env.VITEST === "true";
}

export async function getSessionUserIdFromRequest(
  request: NextRequest | Request
): Promise<string | null> {
  const cookieRequest = request as CookieEnabledRequest;
  const sessionTokensFromCookies = cookieRequest.cookies?.get
    ? readSessionTokensFromCookieReader((name) => {
        return cookieRequest.cookies?.get(name)?.value ?? null;
      })
    : [];

  const sessionTokens = [
    ...sessionTokensFromCookies,
    ...readSessionTokensFromCookieHeader(request.headers.get("cookie")),
  ].filter((token, index, array) => array.indexOf(token) === index);

  if (sessionTokens.length === 0) {
    if (shouldUseSyntheticTestUser()) {
      return "test-user";
    }
    return null;
  }

  const userId = await resolveSessionUserIdFromTokens(sessionTokens);
  if (userId) {
    return userId;
  }

  if (shouldUseSyntheticTestUser()) {
    return "test-user";
  }

  return null;
}

export async function getSessionUserIdFromServer(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionTokens = readSessionTokensFromCookieReader((name) => {
    return cookieStore.get(name)?.value ?? null;
  });

  if (sessionTokens.length === 0) {
    if (shouldUseSyntheticTestUser()) {
      return "test-user";
    }
    return null;
  }

  const userId = await resolveSessionUserIdFromTokens(sessionTokens);
  if (userId) {
    return userId;
  }

  if (shouldUseSyntheticTestUser()) {
    return "test-user";
  }

  return null;
}
