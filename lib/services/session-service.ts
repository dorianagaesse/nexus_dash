import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
  "nexusdash.session-token",
] as const;

type CookieReader = (name: string) => string | null;

function normalizeSessionToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function readSessionTokenFromCookieReader(readCookie: CookieReader): string | null {
  for (const cookieName of SESSION_COOKIE_NAMES) {
    const cookieValue = normalizeSessionToken(readCookie(cookieName));
    if (cookieValue) {
      return cookieValue;
    }
  }

  return null;
}

export function readSessionTokenFromCookieHeader(
  cookieHeaderValue: string | null
): string | null {
  if (!cookieHeaderValue) {
    return null;
  }

  const parts = cookieHeaderValue.split(";").map((entry) => entry.trim());
  const cookieMap = new Map<string, string>();

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    cookieMap.set(name, decodeURIComponent(value));
  }

  return readSessionTokenFromCookieReader((name) => cookieMap.get(name) ?? null);
}

export async function resolveSessionUserIdByToken(
  sessionToken: string
): Promise<string | null> {
  const normalizedToken = normalizeSessionToken(sessionToken);
  if (!normalizedToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sessionToken: normalizedToken },
    select: {
      userId: true,
      expires: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expires.getTime() <= Date.now()) {
    return null;
  }

  return session.userId;
}

export async function deleteSessionByToken(sessionToken: string): Promise<void> {
  const normalizedToken = normalizeSessionToken(sessionToken);
  if (!normalizedToken) {
    return;
  }

  await prisma.session.deleteMany({
    where: { sessionToken: normalizedToken },
  });
}
