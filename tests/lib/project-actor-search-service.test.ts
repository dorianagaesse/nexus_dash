import { beforeEach, describe, expect, test, vi } from "vitest";

const accessMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireProjectRole: accessMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(
    (_actorUserId: string, callback: (db: typeof dbMock) => unknown) =>
      callback(dbMock)
  ),
}));

import { searchProjectActors } from "@/lib/services/project-actor-service";

const owner = {
  id: "owner-1",
  name: "Owner Example",
  email: "owner@example.com",
  username: "owner",
  usernameDiscriminator: "1234",
  avatarSeed: null,
};

const collaborator = {
  id: "user-2",
  name: "Alice Example",
  email: "alice@example.com",
  username: "alice",
  usernameDiscriminator: "5678",
  avatarSeed: null,
};

describe("searchProjectActors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.requireProjectRole.mockResolvedValue({ ok: true, role: "viewer" });
    dbMock.project.findUnique.mockResolvedValue({
      owner,
      memberships: [{ role: "editor", user: collaborator }],
    });
    dbMock.$queryRaw.mockResolvedValue([
      {
        kind: "human",
        actorId: owner.id,
        name: owner.name,
        email: owner.email,
        username: owner.username,
        usernameDiscriminator: owner.usernameDiscriminator,
        avatarSeed: owner.avatarSeed,
        label: null,
        revokedAt: null,
        expiresAt: null,
      },
      {
        kind: "human",
        actorId: collaborator.id,
        name: collaborator.name,
        email: collaborator.email,
        username: collaborator.username,
        usernameDiscriminator: collaborator.usernameDiscriminator,
        avatarSeed: collaborator.avatarSeed,
        label: null,
        revokedAt: null,
        expiresAt: null,
      },
      ...[
        {
          actorId: "credential-active",
          label: "Release bot",
          revokedAt: null,
          expiresAt: null,
        },
        {
          actorId: "credential-revoked",
          label: "Old bot",
          revokedAt: new Date("2026-09-01T00:00:00.000Z"),
          expiresAt: null,
        },
        {
          actorId: "credential-expired",
          label: "Expired bot",
          revokedAt: null,
          expiresAt: new Date("2026-09-08T00:00:00.000Z"),
        },
      ].map((credential) => ({
        kind: "agent",
        name: null,
        email: null,
        username: null,
        usernameDiscriminator: null,
        avatarSeed: null,
        ...credential,
      })),
    ]);
  });

  test("returns matching humans and active agents without credential secrets", async () => {
    const result = await searchProjectActors({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "",
      now: new Date("2026-09-09T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        actors: [
          expect.objectContaining({
            kind: "human",
            id: "user-2",
            displayName: "alice",
            projectRole: "editor",
          }),
          expect.objectContaining({
            kind: "agent",
            id: "credential-active",
            displayName: "Release bot",
            projectRole: null,
          }),
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("credential-revoked");
    expect(JSON.stringify(result)).not.toContain("credential-expired");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("filters agents by credential label", async () => {
    const result = await searchProjectActors({
      actorUserId: "owner-1",
      projectId: "project-1",
      query: "release",
      now: new Date("2026-09-09T00:00:00.000Z"),
    });

    expect(result.ok && result.data.actors).toEqual([
      expect.objectContaining({ kind: "agent", id: "credential-active" }),
    ]);
  });

  test("rejects agent credentials from another project", async () => {
    await expect(
      searchProjectActors({
        actorUserId: "owner-1",
        agentAccess: {
          credentialId: "caller-credential",
          projectId: "project-2",
          scopes: ["project:read"],
        },
        projectId: "project-1",
        query: "",
      })
    ).resolves.toEqual({ ok: false, status: 404, error: "project-not-found" });
    expect(dbMock.project.findUnique).not.toHaveBeenCalled();
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });
});
