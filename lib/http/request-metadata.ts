import crypto from "node:crypto";

export function readClientIpAddressFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstAddress = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (firstAddress) {
      return firstAddress;
    }
  }

  return headers.get("x-real-ip")?.trim() ?? null;
}

export function resolveRequestIdFromHeaders(headers: Headers): string {
  const requestId = headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : crypto.randomUUID();
}

export function readUserAgentFromHeaders(headers: Headers): string | null {
  const userAgent = headers.get("user-agent")?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : null;
}
