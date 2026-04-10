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

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

export function resolveRequestIdFromHeaders(headers: Headers): string {
  const requestId = headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : crypto.randomUUID();
}

export function readUserAgentFromHeaders(headers: Headers): string | null {
  const userAgent = headers.get("user-agent")?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : null;
}
