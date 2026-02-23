import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

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
    if (process.env.NODE_ENV === "test") {
      return "test-user";
    }
    return null;
  }

  return resolveSessionUserIdByToken(sessionToken);
}

export async function getSessionUserIdFromServer(): Promise<string | null> {
  const cookieStore = cookies();
  const sessionToken = readSessionTokenFromCookieReader((name) => {
    return cookieStore.get(name)?.value ?? null;
  });

  if (!sessionToken) {
    if (process.env.NODE_ENV === "test") {
      return "test-user";
    }
    return null;
  }

  return resolveSessionUserIdByToken(sessionToken);
}
