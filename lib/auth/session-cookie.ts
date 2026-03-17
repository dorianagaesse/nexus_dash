import { cookies } from "next/headers";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import { isProductionEnvironment } from "@/lib/env.server";
import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/services/session-service";

export function getPrimarySessionCookieOptions(
  expiresAt: Date
): Pick<ResponseCookie, "httpOnly" | "secure" | "sameSite" | "path" | "expires" | "maxAge"> {
  return {
    httpOnly: true,
    secure: isProductionEnvironment(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function setPrimarySessionCookie(
  sessionToken: string,
  expiresAt: Date
): void {
  cookies().set(
    PRIMARY_SESSION_COOKIE_NAME,
    sessionToken,
    getPrimarySessionCookieOptions(expiresAt)
  );
}
