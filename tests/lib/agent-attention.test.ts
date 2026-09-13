import { describe, expect, test } from "vitest";

import {
  AGENT_ATTENTION_DEFAULT_LIMIT,
  AGENT_ATTENTION_INVALID_CURSOR_ERROR,
  AGENT_ATTENTION_INVALID_FILTER_ERROR,
  buildAgentMeetingTodoAssignmentItemId,
  buildAgentMentionEventItemId,
  buildAgentTaskAssignmentItemId,
  compareAgentAttentionSortKeys,
  decodeAgentAttentionCursor,
  encodeAgentAttentionCursor,
  isAgentAttentionItemAfterCursor,
  mapAgentAttentionFiltersToResponse,
  parseAgentAttentionListFilters,
  type AgentAttentionListFilters,
} from "@/lib/agent-attention";

function mentionFilterConfig() {
  return {
    allowedEventTypes: ["mention"],
    allowedArtifactTypes: ["task_comment"],
    allowedStates: [],
  } as const;
}

function assignmentFilterConfig() {
  return {
    allowedEventTypes: ["assignment"],
    allowedArtifactTypes: ["task", "meeting_todo"],
    allowedStates: ["active", "completed"],
  } as const;
}

function parseMentionQuery(query: string) {
  return parseAgentAttentionListFilters({
    searchParams: new URLSearchParams(query),
    ...mentionFilterConfig(),
  });
}

describe("agent attention item ids", () => {
  test("builds stable per-artifact keys that never collide across artifact types", () => {
    expect(buildAgentMentionEventItemId("abc")).toBe("mention:abc");
    expect(buildAgentTaskAssignmentItemId("abc")).toBe("assignment:task:abc");
    expect(buildAgentMeetingTodoAssignmentItemId("abc")).toBe(
      "assignment:meeting_todo:abc"
    );
  });
});

describe("agent attention cursor codec", () => {
  test("round-trips order, timestamp, and id", () => {
    const occurredAt = new Date("2026-09-12T10:00:00.000Z");
    const encoded = encodeAgentAttentionCursor({
      order: "desc",
      occurredAt,
      id: "mention:abc",
    });

    expect(decodeAgentAttentionCursor(encoded)).toEqual({
      order: "desc",
      occurredAt,
      id: "mention:abc",
    });
  });

  test("round-trips a null timestamp", () => {
    const encoded = encodeAgentAttentionCursor({
      order: "asc",
      occurredAt: null,
      id: "assignment:task:abc",
    });

    expect(decodeAgentAttentionCursor(encoded)).toEqual({
      order: "asc",
      occurredAt: null,
      id: "assignment:task:abc",
    });
  });

  test.each([null, undefined, "", "   "])("rejects empty input %s", (value) => {
    expect(decodeAgentAttentionCursor(value)).toBeNull();
  });

  test("rejects non-base64 and non-json payloads", () => {
    expect(decodeAgentAttentionCursor("not-a-cursor")).toBeNull();
    expect(
      decodeAgentAttentionCursor(Buffer.from("not json", "utf8").toString("base64url"))
    ).toBeNull();
  });

  test.each([
    { v: 2, o: "desc", t: null, id: "x" },
    { v: 1, o: "newest", t: null, id: "x" },
    { v: 1, o: "desc", t: null, id: "" },
    { v: 1, o: "desc", t: "not-a-date", id: "x" },
    { v: 1, o: "desc", t: 123, id: "x" },
  ])("rejects malformed payload %#", (payload) => {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );
    expect(decodeAgentAttentionCursor(encoded)).toBeNull();
  });
});

describe("compareAgentAttentionSortKeys", () => {
  test("sorts missing occurrence times as oldest in both directions", () => {
    const missing = { occurredAt: null, id: "b" };
    const dated = { occurredAt: new Date("2026-09-12T10:00:00.000Z"), id: "a" };

    expect(compareAgentAttentionSortKeys(missing, dated, "asc")).toBeLessThan(0);
    expect(compareAgentAttentionSortKeys(missing, dated, "desc")).toBeGreaterThan(
      0
    );
  });

  test("breaks timestamp ties on id, flipping with direction", () => {
    const occurredAt = new Date("2026-09-12T10:00:00.000Z");
    const left = { occurredAt, id: "a" };
    const right = { occurredAt, id: "b" };

    expect(compareAgentAttentionSortKeys(left, right, "asc")).toBeLessThan(0);
    expect(compareAgentAttentionSortKeys(left, right, "desc")).toBeGreaterThan(0);
  });
});

describe("isAgentAttentionItemAfterCursor", () => {
  const cursor = {
    order: "desc" as const,
    occurredAt: new Date("2026-09-12T10:00:00.000Z"),
    id: "b",
  };

  test("treats items strictly later in the sort order as after the cursor", () => {
    expect(
      isAgentAttentionItemAfterCursor(
        { occurredAt: new Date("2026-09-12T09:00:00.000Z"), id: "c" },
        cursor,
        "desc"
      )
    ).toBe(true);
    expect(
      isAgentAttentionItemAfterCursor(
        { occurredAt: new Date("2026-09-12T11:00:00.000Z"), id: "a" },
        cursor,
        "desc"
      )
    ).toBe(false);
  });

  test("breaks timestamp ties on id ahead of the cursor", () => {
    expect(isAgentAttentionItemAfterCursor(cursor, cursor, "desc")).toBe(false);
    expect(
      isAgentAttentionItemAfterCursor(
        { occurredAt: cursor.occurredAt, id: "a" },
        cursor,
        "desc"
      )
    ).toBe(true);
    expect(
      isAgentAttentionItemAfterCursor(
        { occurredAt: cursor.occurredAt, id: "c" },
        cursor,
        "desc"
      )
    ).toBe(false);
  });

  test("rejects cursors minted for the opposite order", () => {
    expect(
      isAgentAttentionItemAfterCursor(
        { occurredAt: new Date("2026-09-12T09:00:00.000Z"), id: "c" },
        cursor,
        "asc"
      )
    ).toBe(false);
  });
});

describe("parseAgentAttentionListFilters", () => {
  test("applies defaults for an empty query", () => {
    const result = parseMentionQuery("");

    expect(result).toEqual({
      ok: true,
      filters: {
        eventType: null,
        artifactType: null,
        state: null,
        since: null,
        until: null,
        limit: AGENT_ATTENTION_DEFAULT_LIMIT,
        order: "desc",
        cursor: null,
      },
    });
  });

  test("parses the full assignment filter surface", () => {
    const cursor = encodeAgentAttentionCursor({
      order: "asc",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      id: "assignment:task:abc",
    });
    const result = parseAgentAttentionListFilters({
      searchParams: new URLSearchParams(
        `eventType=assignment&artifactType=meeting_todo&state=active&since=2026-09-01T00:00:00.000Z&until=2026-09-13T00:00:00.000Z&limit=10&order=asc&cursor=${encodeURIComponent(cursor)}`
      ),
      ...assignmentFilterConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.filters).toEqual({
      eventType: "assignment",
      artifactType: "meeting_todo",
      state: "active",
      since: new Date("2026-09-01T00:00:00.000Z"),
      until: new Date("2026-09-13T00:00:00.000Z"),
      limit: 10,
      order: "asc",
      cursor: {
        order: "asc",
        occurredAt: new Date("2026-09-12T10:00:00.000Z"),
        id: "assignment:task:abc",
      },
    });
  });

  test.each([
    "eventType=assignment",
    "artifactType=meeting_todo",
    "state=active",
    "state=completed",
  ])("rejects mention filters outside the mention surface (%s)", (query) => {
    expect(parseMentionQuery(query)).toEqual({
      ok: false,
      error: AGENT_ATTENTION_INVALID_FILTER_ERROR,
    });
  });

  test("rejects assignment artifact and state values outside the surface", () => {
    for (const query of [
      "eventType=mention",
      "artifactType=task_comment",
      "state=pending",
    ]) {
      const result = parseAgentAttentionListFilters({
        searchParams: new URLSearchParams(query),
        ...assignmentFilterConfig(),
      });
      expect(result).toEqual({
        ok: false,
        error: AGENT_ATTENTION_INVALID_FILTER_ERROR,
      });
    }
  });

  test.each(["since=not-a-date", "until=2026-13-40", "limit=0", "limit=101", "limit=1.5", "limit=abc", "order=random"])(
    "rejects invalid value in %s",
    (query) => {
      expect(parseMentionQuery(query)).toEqual({
        ok: false,
        error: AGENT_ATTENTION_INVALID_FILTER_ERROR,
      });
    }
  );

  test("rejects inverted time ranges", () => {
    expect(
      parseMentionQuery(
        "since=2026-09-13T00:00:00.000Z&until=2026-09-01T00:00:00.000Z"
      )
    ).toEqual({ ok: false, error: AGENT_ATTENTION_INVALID_FILTER_ERROR });
  });

  test("accepts the maximum limit boundary", () => {
    const result = parseMentionQuery("limit=100");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filters.limit).toBe(100);
    }
  });

  test("rejects undecodable cursors with the cursor error", () => {
    expect(parseMentionQuery("cursor=garbage")).toEqual({
      ok: false,
      error: AGENT_ATTENTION_INVALID_CURSOR_ERROR,
    });
  });

  test("rejects cursors minted for a different order", () => {
    const cursor = encodeAgentAttentionCursor({
      order: "desc",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      id: "mention:abc",
    });

    expect(parseMentionQuery(`order=asc&cursor=${encodeURIComponent(cursor)}`)).toEqual({
      ok: false,
      error: AGENT_ATTENTION_INVALID_CURSOR_ERROR,
    });
  });
});

describe("mapAgentAttentionFiltersToResponse", () => {
  test("serializes bounds to ISO strings and echoes the raw cursor", () => {
    const filters: AgentAttentionListFilters = {
      eventType: "mention",
      artifactType: "task_comment",
      state: null,
      since: new Date("2026-09-01T00:00:00.000Z"),
      until: null,
      limit: 25,
      order: "desc",
      cursor: {
        order: "desc",
        occurredAt: new Date("2026-09-12T10:00:00.000Z"),
        id: "mention:abc",
      },
    };

    expect(
      mapAgentAttentionFiltersToResponse({ filters, rawCursor: "abc123" })
    ).toEqual({
      eventType: "mention",
      artifactType: "task_comment",
      state: null,
      since: "2026-09-01T00:00:00.000Z",
      until: null,
      limit: 25,
      order: "desc",
      cursor: "abc123",
    });
  });
});
