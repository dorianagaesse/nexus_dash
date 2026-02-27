const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";

interface HeaderReader {
  get(name: string): string | null;
}

export function resolveRequestOriginFromHeaders(headers: HeaderReader): string {
  const forwardedProto = headers.get("x-forwarded-proto");
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = headers.get("host");
  if (host) {
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return DEFAULT_LOCAL_ORIGIN;
}
