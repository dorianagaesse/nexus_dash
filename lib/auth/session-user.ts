import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import * as React from "react";

import {
  readSessionTokenFromCookieHeader,
  readSessionTokenFromCookieReader,
  resolveSessionUserIdByToken,
} from "@/lib/services/session-service";

interface CookieEnabledRequest {
  cookies?: {
    get(name: string): { value: string } | undefined;
  };
  headers: Headers;
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
  const sessionTokenFromCookies = cookieRequest.cookies?.get
    ? readSessionTokenFromCookieReader((name) => {
        return cookieRequest.cookies?.get(name)?.value ?? null;
      })
    : null;

  const sessionToken =
    sessionTokenFromCookies ??
    readSessionTokenFromCookieHeader(request.headers.get("cookie"));

  if (!sessionToken) {
    if (shouldUseSyntheticTestUser()) {
      return "test-user";
    }
    return null;
  }

  return resolveSessionUserIdByToken(sessionToken);
}

export async function getSessionUserIdFromServer(): Promise<string | null> {
  return getCachedSessionUserIdFromServer();
}

const reactCache =
  (
    React as unknown as {
      cache?: <T extends (...args: never[]) => unknown>(fn: T) => T;
    }
  ).cache ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);

const getCachedSessionUserIdFromServer = reactCache(
  async (): Promise<string | null> => {
    const cookieStore = cookies();
    const sessionToken = readSessionTokenFromCookieReader((name) => {
      return cookieStore.get(name)?.value ?? null;
    });

    if (!sessionToken) {
      if (shouldUseSyntheticTestUser()) {
        return "test-user";
      }
      return null;
    }

    return resolveSessionUserIdByToken(sessionToken);
  }
);
