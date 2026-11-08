import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    apiCredential: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    agentRuntimeDevice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    agentRuntimeCredential: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    agentRuntimeSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    authAuditEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  role: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: (_actor: string, fn: (db: unknown) => unknown) =>
    fn(mocks.db),
}));
vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: mocks.role,
}));
vi.mock("@/lib/auth/agent-token-service", () => ({
  issueAgentAccessToken: mocks.token,
}));

import {
  exchangeRuntimeAccess,
  manageAgentIdentities,
  validateRuntimeRequest,
} from "@/lib/services/agent-runtime-service";

const future = () => new Date(Date.now() + 3600_000);
const proof = "a".repeat(43);
const identity = () => ({
  id: "oscar",
  publicId: "identity-oscar",
  projectId: "project",
  label: "Oscar",
  createdByUserId: "owner",
  revokedAt: null,
  expiresAt: null,
  canMoveTasksToDone: true,
  scopeGrants: [{ scope: "task_read" }, { scope: "task_write" }],
  project: { ownerId: "owner" },
});
const device = () => ({
  id: "laptop",
  identityId: "oscar",
  authorizedByUserId: "owner",
  name: "Laptop",
  identity: identity(),
  authorizedAt: new Date(),
  revokedAt: null,
  expiresAt: future(),
  scopes: ["task_read"],
  canMoveTasksToDone: false,
  credentials: [{ id: "proof" }],
});
const session = () => ({
  id: "session",
  deviceId: "laptop",
  client: "Codex",
  scopes: ["task_read", "task_write"],
  canMoveTasksToDone: true,
  expiresAt: future(),
  device: device(),
});
const request = {
  credentialId: "oscar",
  projectId: "project",
  ownerUserId: "owner",
  sessionId: "session",
  deviceId: "laptop",
  scopes: ["task:read", "task:write"] as ("task:read" | "task:write")[],
};

describe("portable runtime authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.role.mockResolvedValue({ ok: true, role: "owner" });
    mocks.db.$queryRaw.mockResolvedValue([
      { device_id: "laptop", owner_id: "owner" },
    ]);
    mocks.db.apiCredential.findFirst.mockResolvedValue(identity());
    mocks.db.agentRuntimeDevice.findUnique.mockResolvedValue(device());
    mocks.db.agentRuntimeCredential.findFirst.mockResolvedValue({
      expiresAt: future(),
    });
    mocks.db.agentRuntimeSession.findFirst.mockResolvedValue(session());
    mocks.db.agentRuntimeSession.create.mockResolvedValue(session());
    mocks.token.mockReturnValue({
      accessToken: "short-lived",
      tokenId: "token",
      expiresInSeconds: 300,
    });
  });

  test("intersects token, session, device and current identity grants on every request", async () => {
    const result = await validateRuntimeRequest(request);
    expect(result).toMatchObject({
      ok: true,
      data: {
        scopes: ["task:read"],
        canMoveTasksToDone: false,
        client: "Codex",
        deviceName: "Laptop",
      },
    });
    const changed = session();
    changed.device.identity.scopeGrants = [];
    mocks.db.agentRuntimeSession.findFirst.mockResolvedValue(changed);
    expect(await validateRuntimeRequest(request)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  test.each([
    "identity",
    "device",
    "credential",
    "project",
    "owner",
    "session",
  ])(
    "fails closed when %s authorization is no longer valid",
    async (reason) => {
      const value = session();
      if (reason === "identity")
        value.device.identity.revokedAt = new Date() as never;
      if (reason === "device") value.device.revokedAt = new Date() as never;
      if (reason === "credential") value.device.credentials = [];
      if (reason === "project") value.device.identity.projectId = "other";
      if (reason === "owner")
        value.device.identity.project.ownerId = "new-owner";
      mocks.db.agentRuntimeSession.findFirst.mockResolvedValue(
        reason === "session" ? null : value
      );
      expect(await validateRuntimeRequest(request)).toMatchObject({
        ok: false,
        status: 401,
      });
      expect(mocks.db.agentRuntimeSession.update).not.toHaveBeenCalled();
    }
  );

  test.each([
    { identityId: "nova" },
    { projectId: "other" },
    { identityId: undefined },
  ])("rejects changed or missing explicit bindings: %j", async (overrides) => {
    expect(
      await exchangeRuntimeAccess({
        operation: "start",
        proof,
        projectId: "project",
        identityId: "oscar",
        client: "Codex",
        ...overrides,
      })
    ).toMatchObject({ ok: false, status: 401 });
    expect(mocks.token).not.toHaveBeenCalled();
  });

  test("issues a bound short-lived token with only runtime grants", async () => {
    expect(
      await exchangeRuntimeAccess({
        operation: "start",
        proof,
        projectId: "project",
        identityId: "oscar",
        client: "Codex",
      })
    ).toMatchObject({
      ok: true,
      data: { sessionId: "session", identityId: "oscar" },
    });
    expect(mocks.token).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["task:read"],
        sessionId: "session",
        deviceId: "laptop",
        ttlSeconds: 300,
      })
    );
    expect(mocks.db.agentRuntimeSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ canMoveTasksToDone: false }),
      })
    );
  });

  test("pairing consumes the exact code atomically before creating authentication material", async () => {
    mocks.db.agentRuntimeDevice.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await exchangeRuntimeAccess({
        operation: "pair",
        proof,
        projectId: "project",
        identityId: "oscar",
      })
    ).toMatchObject({ ok: false });
    expect(mocks.db.agentRuntimeCredential.create).not.toHaveBeenCalled();
    mocks.db.agentRuntimeDevice.updateMany.mockResolvedValue({ count: 1 });
    const paired = await exchangeRuntimeAccess({
      operation: "pair",
      proof,
      projectId: "project",
      identityId: "oscar",
    });
    expect(paired.ok).toBe(true);
    const stored = mocks.db.agentRuntimeCredential.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      JSON.stringify(mocks.db.authAuditEvent.create.mock.calls)
    ).not.toContain(proof);
  });

  test("owner authorization is required in the service", async () => {
    mocks.role.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(
      await manageAgentIdentities({
        actorUserId: "editor",
        projectId: "project",
        command: {
          operation: "create",
          name: "Oscar",
          scopes: ["task:read"],
          canMoveTasksToDone: true,
        },
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(mocks.db.apiCredential.create).not.toHaveBeenCalled();
  });

  test("uses the shared descriptive-label validation and storage for identities", async () => {
    mocks.db.apiCredential.create.mockResolvedValue({ id: "oscar" });
    const base = { actorUserId: "owner", projectId: "project" };
    const command = { operation: "create", name: "Oscar", scopes: ["task:read"], canMoveTasksToDone: false };
    expect(await manageAgentIdentities({ ...base, command: { ...command, descriptiveLabels: ["  Orchestrator  ", "orchestrator", "Codex"] } })).toMatchObject({ ok: true });
    expect(mocks.db.apiCredential.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ descriptiveLabels: ["Orchestrator", "Codex"] }) }));
    for (const descriptiveLabels of [null, ["bad,label"], ["x".repeat(41)]]) {
      expect(await manageAgentIdentities({ ...base, command: { ...command, descriptiveLabels } })).toMatchObject({ ok: false, status: 400 });
    }
  });

  test("device grants cannot exceed identity grants, including Done capability", async () => {
    const base = { actorUserId: "owner", projectId: "project" };
    expect(
      await manageAgentIdentities({
        ...base,
        command: {
          operation: "authorize-device",
          identityId: "oscar",
          name: "Laptop",
          scopes: ["task:delete"],
          canMoveTasksToDone: false,
        },
      })
    ).toMatchObject({ ok: false, status: 400 });
    mocks.db.apiCredential.findFirst.mockResolvedValue({
      ...identity(),
      canMoveTasksToDone: false,
    });
    expect(
      await manageAgentIdentities({
        ...base,
        command: {
          operation: "authorize-device",
          identityId: "oscar",
          name: "Laptop",
          scopes: ["task:read"],
          canMoveTasksToDone: true,
        },
      })
    ).toMatchObject({ ok: false, status: 400 });
  });

  test("revoking a device ends only its sessions and does not mutate actor attribution", async () => {
    mocks.db.agentRuntimeDevice.updateMany.mockResolvedValue({ count: 1 });
    expect(
      await manageAgentIdentities({
        actorUserId: "owner",
        projectId: "project",
        command: {
          operation: "revoke-device",
          identityId: "oscar",
          deviceId: "laptop",
        },
      })
    ).toMatchObject({ ok: true });
    expect(mocks.db.agentRuntimeSession.updateMany).toHaveBeenCalledWith({
      where: { deviceId: "laptop", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(mocks.db.apiCredential.update).not.toHaveBeenCalled();
  });
});
