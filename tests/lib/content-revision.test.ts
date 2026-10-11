import { describe, expect, test } from "vitest";
import { contentEtag, parseContentIfMatch, withContentEtag } from "@/lib/content-revision";

describe("content preconditions", () => {
  test("keeps authoring responses private with database-owned validators", () => {
    const headers = withContentEtag({ "Server-Timing": "db;dur=2" }, "task", { id: "task-1", contentRevision: 3 });
    expect(headers.get("ETag")).toBe('"task:task-1:3"');
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(headers.get("Server-Timing")).toBe("db;dur=2");
  });
  test("accepts the entity's exact strong validator and keeps missing headers additive", () => {
    expect(parseContentIfMatch(null, "task", "task-1")).toEqual({ ok: true });
    expect(parseContentIfMatch(contentEtag("task", "task-1", 12), "task", "task-1"))
      .toEqual({ ok: true, expectedRevision: 12 });
  });
  test.each(['*', 'W/"task:task-1:1"', '"task:other:1"', '"context-card:task-1:1"',
    '"task:task-1:-1"', '"task:task-1:01"', '"task:task-1:1.5"', '"task:task-1:2147483648"',
    '"task:task-1:1", "task:task-1:2"', '"task:task-1:NaN"'])
  ("rejects invalid or non-specific preconditions: %s", (header) => {
    expect(parseContentIfMatch(header, "task", "task-1"))
      .toEqual({ ok: false, error: "edit-precondition-invalid" });
  });
});
