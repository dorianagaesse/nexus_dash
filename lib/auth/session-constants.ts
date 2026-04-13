export const PRIMARY_SESSION_COOKIE_NAME = "nexusdash.session-token";
export const LEGACY_SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;
export const SESSION_COOKIE_NAMES = [
  PRIMARY_SESSION_COOKIE_NAME,
  ...LEGACY_SESSION_COOKIE_NAMES,
] as const;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
