import { cookies } from "next/headers";

import { isProductionEnvironment } from "@/lib/env.server";
import {
  PRIMARY_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-constants";

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

export async function setPrimarySessionCookie(
  sessionToken: string,
  expiresAt: Date
): Promise<void> {
  (await cookies()).set(
    PRIMARY_SESSION_COOKIE_NAME,
    sessionToken,
    getPrimarySessionCookieOptions(expiresAt)
  );
}
