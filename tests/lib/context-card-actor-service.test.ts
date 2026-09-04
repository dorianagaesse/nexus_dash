import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: projectAccessServiceMock.buildProjectPrincipalWhere,
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

import {
  loadContextCardActorRegistry,
  mapStoredContextCardActor,
  resolveAssignableContextCardActorFromRegistry,
} from "@/lib/services/context-card-actor-service";

describe("context-card-actor-service mapStoredContextCardActor", () => {
  test("returns null when no id and no snapshot are provided", () => {
    expect(
      mapStoredContextCardActor({
        kind: "human",
        id: null,
        displayNameSnapshot: null,
      })
    ).toBeNull();
  });

  test("marks a human as active when the actor row resolves", () => {
    const actor = mapStoredContextCardActor({
      kind: "human",
      id: "user-1",
      displayNameSnapshot: "Ada Lovelace",
      user: {
        id: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        username: "ada",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-ada",
      },
      isCurrentProjectHuman: true,
    });

    expect(actor).toMatchObject({
      kind: "human",
      id: "user-1",
      displayName: "ada",
      usernameTag: "ada#0001",
      avatarSeed: "seed-ada",
      status: "active",
      isAssignable: true,
    });
  });

  test("falls back to a historical identity when no actor row is present", () => {
    const actor = mapStoredContextCardActor({
      kind: "human",
      id: null,
      displayNameSnapshot: "Former owner",
    });

    expect(actor).toMatchObject({
      kind: "human",
      id: "historical-human-Former%20owner",
      displayName: "Former owner",
      status: "inactive",
      isAssignable: false,
    });
  });

  test("marks an agent credential as revoked when the row resolves to revoked", () => {
    const actor = mapStoredContextCardActor({
      kind: "agent",
      id: "cred-1",
      displayNameSnapshot: "Release:bot",
      credential: {
        id: "cred-1",
        label: "Release:bot",
        projectId: "project-1",
        revokedAt: new Date("2026-07-01T00:00:00.000Z"),
        expiresAt: null,
      },
    });

    expect(actor).toMatchObject({
      kind: "agent",
      id: "cred-1",
      displayName: "Release:bot",
      status: "revoked",
      isAssignable: false,
    });
  });
});

describe("context-card-actor-service registry resolver", () => {
  const baseRegistry = {
    activeHumanIds: new Set(["user-1"]),
    humanById: new Map([
      [
        "user-1",
        {
          kind: "human" as const,
          id: "user-1",
          displayName: "ada",
          usernameTag: "ada#0001",
          avatarSeed: "seed",
          status: "active" as const,
          isAssignable: true,
        },
      ],
    ]),
    credentialById: new Map([
      [
        "cred-1",
        {
          kind: "agent" as const,
          id: "cred-1",
          displayName: "Release:bot",
          usernameTag: null,
          avatarSeed: null,
          status: "active" as const,
          isAssignable: true,
        },
      ],
    ]),
    assignable: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves an active human steward", () => {
    const result = resolveAssignableContextCardActorFromRegistry({
      registry: baseRegistry,
      reference: { kind: "human", id: "user-1" },
    });

    expect(result).toMatchObject({
      ok: true,
      actor: {
        userId: "user-1",
        credentialId: null,
        displayNameSnapshot: "ada",
      },
    });
  });

  test("resolves an active agent steward", () => {
    const result = resolveAssignableContextCardActorFromRegistry({
      registry: baseRegistry,
      reference: { kind: "agent", id: "cred-1" },
    });

    expect(result).toMatchObject({
      ok: true,
      actor: {
        userId: null,
        credentialId: "cred-1",
        displayNameSnapshot: "Release:bot",
      },
    });
  });

  test("rejects a steward that is not in the registry", () => {
    const result = resolveAssignableContextCardActorFromRegistry({
      registry: baseRegistry,
      reference: { kind: "human", id: "user-2" },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "context-card-steward-invalid",
    });
  });

  test("rejects a steward that the registry marks as not assignable", () => {
    const registry = {
      ...baseRegistry,
      humanById: new Map([
        [
          "user-1",
          {
            ...baseRegistry.humanById.get("user-1")!,
            isAssignable: false,
          },
        ],
      ]),
    };
    const result = resolveAssignableContextCardActorFromRegistry({
      registry,
      reference: { kind: "human", id: "user-1" },
    });
    expect(result.ok).toBe(false);
  });

  test("returns an error when the registry itself is missing", () => {
    const result = resolveAssignableContextCardActorFromRegistry({
      registry: null,
      reference: { kind: "human", id: "user-1" },
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "context-card-steward-invalid",
    });
  });
});

describe("context-card-actor-service RLS-safe registry", () => {
  test("hydrates project humans and agents from the display-safe SQL projection", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          kind: "human",
          actorId: "user-1",
          name: "Ada",
          email: "ada@example.com",
          username: "ada",
          usernameDiscriminator: "0001",
          avatarSeed: "seed-ada",
          label: null,
          revokedAt: null,
          expiresAt: null,
        },
        {
          kind: "agent",
          actorId: "credential-1",
          name: null,
          email: null,
          username: null,
          usernameDiscriminator: null,
          avatarSeed: null,
          label: "Release bot",
          revokedAt: null,
          expiresAt: null,
        },
      ]),
    };

    const registry = await loadContextCardActorRegistry({
      db: db as never,
      projectId: "project-1",
      now: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(registry?.assignable).toEqual([
      expect.objectContaining({ kind: "human", id: "user-1" }),
      expect.objectContaining({ kind: "agent", id: "credential-1" }),
    ]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
