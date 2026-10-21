export const PROJECT_ACTIVITY_VERSION_HEADER = "x-nexusdash-project-version";

function toVersionString(version: Date): string {
  return version.toISOString();
}

export function withProjectActivityVersionHeader(
  headers: HeadersInit = {},
  version = new Date()
): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(PROJECT_ACTIVITY_VERSION_HEADER, toVersionString(version));
  return nextHeaders;
}

export function readProjectActivityVersionHeader(response: Response): string | null {
  return response.headers?.get ? response.headers.get(PROJECT_ACTIVITY_VERSION_HEADER) : null;
}

function parseProjectActivityVersion(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isProjectActivityVersionNewer(
  candidate: string,
  baseline: string
): boolean {
  return (
    parseProjectActivityVersion(candidate) > parseProjectActivityVersion(baseline)
  );
}
