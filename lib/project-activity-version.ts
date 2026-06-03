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
  return response.headers.get(PROJECT_ACTIVITY_VERSION_HEADER);
}
