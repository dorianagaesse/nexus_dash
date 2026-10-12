export type ContentDomain = "task" | "meeting-note" | "context-card";
export const CONTENT_IF_MATCH_HEADER = "x-content-if-match";

export interface VersionedContent {
  id: string;
  contentRevision: number;
}

export function contentEtag(domain: ContentDomain, id: string, revision: number): string {
  return `"${domain}:${encodeURIComponent(id)}:${revision}"`;
}

/** This additive release accepts one strong, entity-specific validator. */
export function parseContentIfMatch(
  header: string | null,
  domain: ContentDomain,
  id: string
): { ok: true; expectedRevision?: number } | { ok: false; error: string } {
  if (header === null) return { ok: true };
  const prefix = `"${domain}:${encodeURIComponent(id)}:`;
  const value = header.trim();
  if (!value.startsWith(prefix) || !value.endsWith('"')) {
    return { ok: false, error: "edit-precondition-invalid" };
  }
  const raw = value.slice(prefix.length, -1);
  const revision = Number(raw);
  if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(revision) || revision > 2_147_483_647) {
    return { ok: false, error: "edit-precondition-invalid" };
  }
  return { ok: true, expectedRevision: revision };
}

/** Vercel evaluates standard If-Match against the post-mutation response. */
export function parseContentPrecondition(headers: Headers, domain: ContentDomain, id: string) {
  if (headers.has("if-match")) {
    return { ok: false as const, error: "edit-precondition-transport" };
  }
  return parseContentIfMatch(headers.get(CONTENT_IF_MATCH_HEADER), domain, id);
}

export function withContentEtag(
  headers: HeadersInit,
  domain: ContentDomain,
  entity: { id: string; contentRevision?: number }
): Headers {
  const result = new Headers(headers);
  // Authoring content is private and must not be retained by shared caches.
  result.set("Cache-Control", "private, no-store");
  result.set("Vercel-CDN-Cache-Control", "no-store");
  if (entity.contentRevision !== undefined) {
    result.set("ETag", contentEtag(domain, entity.id, entity.contentRevision));
  }
  return result;
}

export function contentErrorBody(result: { error: string; current?: VersionedContent }) {
  return result.current
    ? { error: result.error, contentRevision: result.current.contentRevision, current: result.current }
    : { error: result.error };
}
