import { cookies } from "next/headers";

import { isProductionEnvironment } from "@/lib/env.server";
import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/services/session-service";

type PrimarySessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
  maxAge: number;
};

export function getPrimarySessionCookieOptions(
  expiresAt: Date
): PrimarySessionCookieOptions {
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
