export type ContentDomain = "task" | "meeting-note" | "context-card";

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

export function withContentEtag(
  headers: HeadersInit,
  domain: ContentDomain,
  entity: { id: string; contentRevision?: number }
): Headers {
  const result = new Headers(headers);
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
