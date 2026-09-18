import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const projectAccessMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
  buildProjectPrincipalWhere: vi.fn(() => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessMock.requireProjectRole,
  buildProjectPrincipalWhere: projectAccessMock.buildProjectPrincipalWhere,
}));

import {
  buildProjectActivityChanges,
  buildProjectActivitySummary,
  decodeProjectActivityHistoryCursor,
  encodeProjectActivityHistoryCursor,
  listProjectActivityHistory,
  pruneProjectActivityHistory,
  projectActivityServiceInternals,
  recordProjectActivityEvent,
  touchProjectActivity,
  touchProjectMembershipActivity,
} from "@/lib/services/project-activity-service";

describe("project-activity-service", () => {
  test("touchProjectActivity advances the project updatedAt marker", async () => {
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");
    const projectUpdate = vi.fn().mockResolvedValue({ id: "project-1" });

    const result = await touchProjectActivity({
      db: {
        project: {
          update: projectUpdate,
        },
      } as never,
      projectId: " project-1 ",
      occurredAt,
    });

    expect(result).toBe(occurredAt);
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { updatedAt: occurredAt },
      select: { id: true },
    });
  });

  test("touchProjectActivity ignores empty project identifiers", async () => {
    const projectUpdate = vi.fn();
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");

    const result = await touchProjectActivity({
      db: {
        project: {
          update: projectUpdate,
        },
      } as never,
      projectId: " ",
      occurredAt,
    });

    expect(result).toBe(occurredAt);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  test("touchProjectMembershipActivity advances the project marker for accepted membership changes", async () => {
    const occurredAt = new Date("2026-06-26T08:00:00.000Z");
    const projectUpdate = vi.fn().mockResolvedValue({ id: "project-1" });

    const result = await touchProjectMembershipActivity({
      db: {
        project: {
          update: projectUpdate,
        },
      } as never,
      projectId: " project-1 ",
      actorUserId: " user-1 ",
      invitationId: " invite-1 ",
      occurredAt,
    });

    expect(result).toBe(occurredAt);
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { updatedAt: occurredAt },
      select: { id: true },
    });
  });

  test("recordProjectActivityEvent creates a typed event and advances project activity", async () => {
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");
    const projectUpdate = vi.fn().mockResolvedValue({ id: "project-1" });
    const userFindUnique = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "Alice Example",
      email: "alice@example.com",
      username: null,
      usernameDiscriminator: null,
      avatarSeed: null,
    });
    const eventCreate = vi.fn().mockResolvedValue({
      id: "event-1",
      projectId: "project-1",
      actorUserId: "user-1",
      domain: "task",
      action: "created",
      entityId: "task-1",
      version: occurredAt,
      payload: { taskId: "task-1" },
      createdAt: occurredAt,
    });

    const result = await recordProjectActivityEvent({
      db: {
        project: {
          update: projectUpdate,
        },
        projectActivityEvent: {
          create: eventCreate,
        },
        user: {
          findUnique: userFindUnique,
        },
      } as never,
      projectId: " project-1 ",
      actorUserId: " user-1 ",
      domain: "task",
      action: "created",
      entityId: " task-1 ",
      payload: { taskId: "task-1" },
      occurredAt,
    });

    expect(result?.id).toBe("event-1");
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { updatedAt: occurredAt },
      select: { id: true },
    });
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        actorUserId: "user-1",
        actorCredentialId: null,
        actorKind: "human",
        actorDisplayNameSnapshot: "Alice Example",
        domain: "task",
        action: "created",
        entityId: "task-1",
        entityDisplayNameSnapshot: null,
        summary: "Created task",
        changes: Prisma.JsonNull,
        version: occurredAt,
        payload: { taskId: "task-1" },
      },
      select: expect.objectContaining({
        id: true,
        projectId: true,
        version: true,
      }),
    });
  });

  test("builds a composite cursor query for same-version activity events", () => {
    const version = new Date("2026-05-30T10:00:00.000Z");
    const createdAt = new Date("2026-05-30T10:00:00.001Z");

    expect(
      projectActivityServiceInternals.buildProjectActivityEventCursorWhere(
        "project-1",
        {
          version,
          createdAt,
          id: "event-1",
        }
      )
    ).toEqual({
      projectId: "project-1",
      OR: [
        { version: { gt: version } },
        {
          version,
          createdAt: { gt: createdAt },
        },
        {
          version,
          createdAt,
          id: { gt: "event-1" },
        },
      ],
    });
  });
});

describe("project-activity-history cursor codec", () => {
  test("round-trips version, createdAt, and id", () => {
    const version = new Date("2026-09-18T10:00:00.000Z");
    const createdAt = new Date("2026-09-18T10:00:01.000Z");

    const encoded = encodeProjectActivityHistoryCursor({
      version,
      createdAt,
      id: "event-1",
    });

    expect(decodeProjectActivityHistoryCursor(encoded)).toEqual({
      version,
      createdAt,
      id: "event-1",
    });
  });

  test("rejects blank, malformed, and incomplete cursors", () => {
    const validVersion = "2026-09-18T10:00:00.000Z";
    const validCreatedAt = "2026-09-18T10:00:01.000Z";

    expect(decodeProjectActivityHistoryCursor(null)).toBeNull();
    expect(decodeProjectActivityHistoryCursor("   ")).toBeNull();
    expect(decodeProjectActivityHistoryCursor("not-a-cursor")).toBeNull();
    expect(
      decodeProjectActivityHistoryCursor(
        Buffer.from(JSON.stringify("hello"), "utf8").toString("base64url")
      )
    ).toBeNull();
    expect(
      decodeProjectActivityHistoryCursor(
        Buffer.from(
          JSON.stringify({ v: validVersion, c: validCreatedAt }),
          "utf8"
        ).toString("base64url")
      )
    ).toBeNull();
    expect(
      decodeProjectActivityHistoryCursor(
        Buffer.from(
          JSON.stringify({ v: "yesterday", c: validCreatedAt, i: "event-1" }),
          "utf8"
        ).toString("base64url")
      )
    ).toBeNull();
    expect(
      decodeProjectActivityHistoryCursor(
        Buffer.from(
          JSON.stringify({ v: validVersion, c: validCreatedAt, i: "   " }),
          "utf8"
        ).toString("base64url")
      )
    ).toBeNull();
  });
});

describe("buildProjectActivityChanges", () => {
  test("drops no-op and blank entries and returns undefined when nothing remains", () => {
    expect(buildProjectActivityChanges(null)).toBeUndefined();
    expect(buildProjectActivityChanges([])).toBeUndefined();
    expect(
      buildProjectActivityChanges([
        { field: "status", before: "Done", after: "Done" },
      ])
    ).toBeUndefined();
    expect(
      buildProjectActivityChanges([{ field: "   ", before: "a", after: "b" }])
    ).toBeUndefined();
    expect(
      buildProjectActivityChanges([{ field: "points", before: 5, after: "5" }])
    ).toBeUndefined();
  });

  test("normalizes before/after values into bounded strings", () => {
    const long = "a".repeat(250);

    expect(
      buildProjectActivityChanges([
        { field: " status ", before: null, after: "Done" },
        { field: "points", before: 3, after: 5 },
        {
          field: "dueDate",
          before: new Date("2026-09-18T10:00:00.000Z"),
          after: null,
        },
        { field: "description", before: long, after: "short" },
      ])
    ).toEqual([
      { field: "status", before: null, after: "Done" },
      { field: "points", before: "3", after: "5" },
      { field: "dueDate", before: "2026-09-18T10:00:00.000Z", after: null },
      { field: "description", before: `${"a".repeat(199)}…`, after: "short" },
    ]);
  });

  test("caps the number of recorded fields", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      field: `field-${index}`,
      before: "old",
      after: "new",
    }));

    const changes = buildProjectActivityChanges(entries) as Array<{
      field: string;
    }>;

    expect(changes).toHaveLength(20);
    expect(changes[0]?.field).toBe("field-0");
    expect(changes[19]?.field).toBe("field-19");
  });
});

describe("buildProjectActivitySummary", () => {
  test("formats action, domain, and entity name", () => {
    expect(
      buildProjectActivitySummary({
        domain: "task",
        action: "updated",
        entityDisplayNameSnapshot: "Ship the timeline",
      })
    ).toBe('Updated task "Ship the timeline"');
    expect(
      buildProjectActivitySummary({
        domain: "roadmap",
        action: "moved",
        entityDisplayNameSnapshot: "Private beta",
      })
    ).toBe('Moved roadmap item "Private beta"');
  });

  test("omits the quoted name when there is no entity snapshot", () => {
    expect(
      buildProjectActivitySummary({ domain: "project", action: "created" })
    ).toBe("Created project");
  });
});

describe("pruneProjectActivityHistory", () => {
  test("returns an empty summary when raw queries are unavailable", async () => {
    const summary = await pruneProjectActivityHistory({
      db: {} as never,
      now: new Date("2026-09-18T00:00:00.000Z"),
      retentionDays: 365,
    });

    expect(summary).toEqual({
      deleted: 0,
      batches: 0,
      cutoff: new Date("2025-09-18T00:00:00.000Z"),
    });
  });

  test("deletes retention-expired batches until a partial batch", async () => {
    const $queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ deleted: 2 }])
      .mockResolvedValueOnce([{ deleted: 2 }])
      .mockResolvedValueOnce([{ deleted: 1 }]);

    const summary = await pruneProjectActivityHistory({
      db: { $queryRaw } as never,
      now: new Date("2026-09-18T00:00:00.000Z"),
      retentionDays: 365,
      batchSize: 2,
      maxBatches: 10,
    });

    expect(summary).toEqual({
      deleted: 5,
      batches: 3,
      cutoff: new Date("2025-09-18T00:00:00.000Z"),
    });
    expect($queryRaw).toHaveBeenCalledTimes(3);
    const firstCall = $queryRaw.mock.calls[0]?.[0] as { values: unknown[] };
    expect(firstCall.values).toEqual([
      new Date("2025-09-18T00:00:00.000Z"),
      2,
    ]);
  });

  test("stops at the configured batch ceiling", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ deleted: 1 }]);

    const summary = await pruneProjectActivityHistory({
      db: { $queryRaw } as never,
      batchSize: 1,
      maxBatches: 2,
    });

    expect(summary.batches).toBe(2);
    expect(summary.deleted).toBe(2);
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });
});

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-3",
    projectId: "project-1",
    actorUserId: "user-1",
    actorCredentialId: null,
    actorKind: "human",
    actorDisplayNameSnapshot: "Alice Example",
    domain: "task",
    action: "updated",
    entityId: "task-1",
    entityDisplayNameSnapshot: "Ship the timeline",
    summary: 'Updated task "Ship the timeline"',
    changes: [{ field: "status", before: "Backlog", after: "Done" }],
    version: new Date("2026-09-18T10:00:03.000Z"),
    createdAt: new Date("2026-09-18T10:00:04.000Z"),
    ...overrides,
  };
}

describe("listProjectActivityHistory", () => {
  const db = {
    projectActivityEvent: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessMock.requireProjectRole.mockResolvedValue({
      ok: true,
      status: 200,
      data: { role: "viewer" },
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, callback: (client: unknown) => unknown) =>
        callback(db)
    );
    db.projectActivityEvent.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([]);
  });

  test("returns a bounded page with a cursor and snapshot actor fallback", async () => {
    db.projectActivityEvent.findMany.mockResolvedValueOnce([
      historyRow({ id: "event-3" }),
      historyRow({
        id: "event-2",
        changes: null,
        version: new Date("2026-09-18T10:00:02.000Z"),
        createdAt: new Date("2026-09-18T10:00:02.001Z"),
      }),
      historyRow({
        id: "event-1",
        changes: [{ before: "orphan" }],
        version: new Date("2026-09-18T10:00:01.000Z"),
        createdAt: new Date("2026-09-18T10:00:01.001Z"),
      }),
    ]);

    const result = await listProjectActivityHistory({
      actorUserId: "user-1",
      projectId: "project-1",
      take: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected history page");
    }

    expect(result.data.entries).toEqual([
      {
        id: "event-3",
        domain: "task",
        action: "updated",
        entityId: "task-1",
        entityDisplayNameSnapshot: "Ship the timeline",
        summary: 'Updated task "Ship the timeline"',
        changes: [{ field: "status", before: "Backlog", after: "Done" }],
        version: new Date("2026-09-18T10:00:03.000Z"),
        createdAt: new Date("2026-09-18T10:00:04.000Z"),
        actor: {
          kind: "human",
          id: "user-1",
          displayName: "Alice Example",
          usernameTag: null,
          avatarSeed: null,
          status: "inactive",
          isAssignable: false,
        },
      },
      {
        id: "event-2",
        domain: "task",
        action: "updated",
        entityId: "task-1",
        entityDisplayNameSnapshot: "Ship the timeline",
        summary: 'Updated task "Ship the timeline"',
        changes: null,
        version: new Date("2026-09-18T10:00:02.000Z"),
        createdAt: new Date("2026-09-18T10:00:02.001Z"),
        actor: {
          kind: "human",
          id: "user-1",
          displayName: "Alice Example",
          usernameTag: null,
          avatarSeed: null,
          status: "inactive",
          isAssignable: false,
        },
      },
    ]);
    expect(decodeProjectActivityHistoryCursor(result.data.nextCursor)).toEqual({
      version: new Date("2026-09-18T10:00:02.000Z"),
      createdAt: new Date("2026-09-18T10:00:02.001Z"),
      id: "event-2",
    });

    const call = db.projectActivityEvent.findMany.mock.calls[0]?.[0] as {
      where: unknown;
      orderBy: unknown;
      take: number;
      select: Record<string, boolean>;
    };
    expect(call.where).toEqual({ projectId: "project-1" });
    expect(call.orderBy).toEqual([
      { version: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(call.take).toBe(3);
    expect(call.select.payload).toBeUndefined();
    expect(call.select.summary).toBe(true);
  });

  test("applies the decoded cursor and clamps take to the page maximum", async () => {
    const version = new Date("2026-09-18T09:00:00.000Z");
    const createdAt = new Date("2026-09-18T09:00:01.000Z");
    const cursor = encodeProjectActivityHistoryCursor({
      version,
      createdAt,
      id: "event-9",
    });

    const result = await listProjectActivityHistory({
      actorUserId: "user-1",
      projectId: "project-1",
      cursor,
      take: 100,
    });

    expect(result).toEqual({
      ok: true,
      data: { entries: [], nextCursor: null },
    });

    const call = db.projectActivityEvent.findMany.mock.calls[0]?.[0] as {
      where: unknown;
      take: number;
    };
    expect(call.take).toBe(51);
    expect(call.where).toEqual({
      projectId: "project-1",
      OR: [
        { version: { lt: version } },
        { version, createdAt: { lt: createdAt } },
        { version, createdAt, id: { lt: "event-9" } },
      ],
    });
  });

  test("rejects malformed cursors before querying", async () => {
    const result = await listProjectActivityHistory({
      actorUserId: "user-1",
      projectId: "project-1",
      cursor: "not-a-cursor",
    });

    expect(result).toEqual({ ok: false, status: 400, error: "invalid-cursor" });
    expect(db.projectActivityEvent.findMany).not.toHaveBeenCalled();
  });

  test("returns an empty page when the client cannot list history", async () => {
    rlsContextMock.withActorRlsContext.mockImplementationOnce(
      async (_actorUserId: string, callback: (client: unknown) => unknown) =>
        callback({ $queryRaw: vi.fn() })
    );

    const result = await listProjectActivityHistory({
      actorUserId: "user-1",
      projectId: "project-1",
    });

    expect(result).toEqual({
      ok: true,
      data: { entries: [], nextCursor: null },
    });
    expect(db.projectActivityEvent.findMany).not.toHaveBeenCalled();
  });

  test("surfaces project access failures", async () => {
    projectAccessMock.requireProjectRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const result = await listProjectActivityHistory({
      actorUserId: "user-1",
      projectId: "project-1",
    });

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(db.projectActivityEvent.findMany).not.toHaveBeenCalled();
  });

  test("resolves agent actors through the live registry", async () => {
    db.$queryRaw.mockResolvedValueOnce([
      {
        kind: "agent",
        actorId: "credential-1",
        name: null,
        email: null,
        username: null,
        usernameDiscriminator: null,
        avatarSeed: null,
        label: "Build bot",
        revokedAt: null,
        expiresAt: null,
      },
    ]);
    db.projectActivityEvent.findMany.mockResolvedValueOnce([
      historyRow({
        id: "event-4",
        actorUserId: "owner-1",
        actorCredentialId: "credential-1",
        actorKind: "agent",
        actorDisplayNameSnapshot: "Build bot",
      }),
    ]);

    const result = await listProjectActivityHistory({
      actorUserId: "owner-1",
      projectId: "project-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected history page");
    }

    expect(result.data.entries[0]?.actor).toEqual({
      kind: "agent",
      id: "credential-1",
      displayName: "Build bot",
      usernameTag: null,
      avatarSeed: null,
      status: "active",
      isAssignable: true,
    });
    expect(result.data.nextCursor).toBeNull();
  });
});
