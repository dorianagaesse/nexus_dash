import crypto from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  prismaMock,
  txMock,
  requireProjectRoleMock,
  withActorRlsContextMock,
} = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    apiCredential: {
      findFirst: vi.fn(),
    },
    agentRuntimeDevice: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    agentRuntimeCredential: {
      create: vi.fn(),
    },
    agentCliPairingRequest: {
      updateMany: vi.fn(),
    },
    authAuditEvent: {
      create: vi.fn(),
    },
  };
  const prisma = {
    agentRuntimeCredential: {
      findUnique: vi.fn(),
    },
    agentCliPairingRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    prismaMock: prisma,
    txMock: tx,
    requireProjectRoleMock: vi.fn(),
    withActorRlsContextMock: vi.fn(
      async (_actorId: string, fn: (db: typeof tx) => unknown) => fn(tx)
    ),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: requireProjectRoleMock,
}));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: withActorRlsContextMock,
}));

import {
  beginAgentCliPairing,
  generateCliUserCode,
  inspectAgentCliPairingForUser,
  normalizeCliUserCode,
  pollAgentCliPairing,
  respondToAgentCliPairing,
} from "@/lib/services/agent-cli-pairing-service";

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

describe("agent-cli-pairing-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.agentRuntimeCredential.findUnique.mockResolvedValue(null);
    txMock.project.findMany.mockResolvedValue([]);
    requireProjectRoleMock.mockResolvedValue({ ok: true, role: "owner" });
    txMock.$queryRaw.mockResolvedValue([{ id: "proj-1" }]);
  });

  test("normalizes valid user codes and rejects ambiguous or malformed inputs", () => {
    const generated = generateCliUserCode();
    expect(generated).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeCliUserCode(generated.toLowerCase().replace("-", " "))).toBe(
      generated
    );
    expect(normalizeCliUserCode("ab23cd45")).toBe("AB23-CD45");
    expect(normalizeCliUserCode("OOOO-1111")).toBeNull();
    expect(normalizeCliUserCode("SHORT")).toBeNull();
    expect(normalizeCliUserCode(null)).toBeNull();
  });

  test("begins CLI pairing with hashed secrets only and rejects invalid inputs", async () => {
    expect(
      await beginAgentCliPairing({
        installSecretHash: "not-hex",
        deviceName: "Laptop",
      })
    ).toEqual({
      ok: false,
      status: 400,
      error: "invalid-install-secret-hash",
    });

    const installHash = sha256("install-secret-1");
    expect(
      await beginAgentCliPairing({
        installSecretHash: installHash,
        deviceName: "   ",
      })
    ).toEqual({
      ok: false,
      status: 400,
      error: "invalid-device-name",
    });

    prismaMock.agentCliPairingRequest.create.mockResolvedValueOnce({
      id: "req-1",
    });

    const started = await beginAgentCliPairing({
      installSecretHash: installHash,
      deviceName: "MacBook Pro (nd)",
      projectId: "proj-1",
      identityId: "oscar",
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.status).toBe(201);
    expect(started.data.requestId).toBe("req-1");
    expect(started.data.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.data.pollSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.data.authorizePath).toBe(
      `/cli/authorize?code=${started.data.userCode}`
    );

    const createArg = prismaMock.agentCliPairingRequest.create.mock.calls[0]?.[0];
    expect(createArg.data.userCodeHash).toBe(sha256(started.data.userCode));
    expect(createArg.data.pollSecretHash).toBe(sha256(started.data.pollSecret));
    expect(createArg.data.installSecretHash).toBe(installHash);
    expect(JSON.stringify(createArg)).not.toContain(started.data.pollSecret);
    expect(JSON.stringify(createArg)).not.toContain(started.data.userCode);
  });

  test("inspects pending, expired, denied, and owner-approved pairing states", async () => {
    txMock.project.findMany.mockResolvedValue([
      {
        id: "proj-1",
        name: "NexusDash",
        apiCredentials: [
          {
            id: "oscar",
            label: "Oscar",
            descriptiveLabels: ["Orchestrator"],
            identityMode: true,
            revokedAt: null,
            expiresAt: null,
            canMoveTasksToDone: true,
            scopeGrants: [{ scope: "task_read" }, { scope: "task_write" }],
            runtimeDevices: [
              {
                authorizedAt: new Date(),
                revokedAt: null,
                expiresAt: new Date(Date.now() + 86_400_000),
              },
            ],
          },
        ],
      },
    ]);

    const emptyView = await inspectAgentCliPairingForUser({
      actorUserId: "owner-1",
      rawCode: "",
    });
    expect(emptyView.state).toBe("code-required");
    expect(emptyView.ownedProjects[0]?.identities[0]).toMatchObject({
      id: "oscar",
      name: "Oscar",
      scopes: ["task:read", "task:write"],
      pairedDeviceCount: 1,
    });

    const invalidView = await inspectAgentCliPairingForUser({
      actorUserId: "owner-1",
      rawCode: "bad!",
    });
    expect(invalidView.state).toBe("invalid-code");

    prismaMock.agentCliPairingRequest.findUnique.mockResolvedValueOnce({
      id: "req-ready",
      userCodeHash: sha256("ABCD-EFGH"),
      requestedDeviceName: "Laptop (nd)",
      requestedProjectId: "proj-1",
      requestedIdentityId: "oscar",
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      deniedAt: null,
      approvedByUserId: null,
      approvedDeviceId: null,
    });
    const readyView = await inspectAgentCliPairingForUser({
      actorUserId: "owner-1",
      rawCode: "abcd-efgh",
    });
    expect(readyView.state).toBe("ready");
    expect(readyView.userCode).toBe("ABCD-EFGH");
    expect(readyView.request?.requestedIdentityId).toBe("oscar");
  });

  test("approves installation within identity permission ceiling and records audit event", async () => {
    const installHash = sha256("install-secret-2");
    prismaMock.agentCliPairingRequest.findUnique.mockResolvedValue({
      id: "req-approve",
      userCodeHash: sha256("BCDE-FGHJ"),
      installSecretHash: installHash,
      expiresAt: new Date(Date.now() + 300_000),
      approvedAt: null,
      deniedAt: null,
    });
    txMock.project.findUnique.mockResolvedValue({
      id: "proj-1",
      name: "NexusDash",
      ownerId: "owner-1",
    });
    txMock.apiCredential.findFirst.mockResolvedValue({
      id: "oscar",
      projectId: "proj-1",
      label: "Oscar",
      descriptiveLabels: ["Orchestrator"],
      revokedAt: null,
      expiresAt: null,
      canMoveTasksToDone: false,
      scopeGrants: [{ scope: "task_read" }, { scope: "task_write" }],
    });

    // Rejects Done capability when the identity itself does not have Done allowed.
    const rejectedDone = await respondToAgentCliPairing({
      actorUserId: "owner-1",
      command: {
        code: "BCDE-FGHJ",
        decision: "approve",
        projectId: "proj-1",
        identityId: "oscar",
        deviceName: "Laptop A",
        scopes: ["task:read", "task:write"],
        canMoveTasksToDone: true,
      },
    });
    expect(rejectedDone).toEqual({
      ok: false,
      status: 400,
      error: "invalid-device-grants",
    });

    txMock.agentRuntimeDevice.create.mockResolvedValueOnce({ id: "dev-1" });
    txMock.agentRuntimeCredential.create.mockResolvedValueOnce({ id: "cred-1" });
    txMock.agentCliPairingRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    txMock.authAuditEvent.create.mockResolvedValueOnce({ id: "audit-1" });

    const approved = await respondToAgentCliPairing({
      actorUserId: "owner-1",
      command: {
        code: "BCDE-FGHJ",
        decision: "approve",
        projectId: "proj-1",
        identityId: "oscar",
        deviceName: "Laptop A",
        scopes: ["task:read"],
        canMoveTasksToDone: false,
      },
    });

    expect(approved.ok).toBe(true);
    if (!approved.ok || approved.data.decision !== "approved") return;
    expect(approved.data).toMatchObject({
      decision: "approved",
      projectId: "proj-1",
      projectName: "NexusDash",
      identityId: "oscar",
      identityName: "Oscar",
      deviceId: "dev-1",
      deviceName: "Laptop A",
      scopes: ["task:read"],
      canMoveTasksToDone: false,
    });
    expect(txMock.agentRuntimeCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: "dev-1",
          tokenHash: installHash,
        }),
      })
    );
    expect(txMock.authAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  test("polls pending and delivers approved installation metadata exactly once", async () => {
    const pollSecret = crypto.randomBytes(32).toString("base64url");
    prismaMock.agentCliPairingRequest.findUnique.mockResolvedValueOnce({
      id: "req-poll",
      pollSecretHash: sha256(pollSecret),
      expiresAt: new Date(Date.now() + 120_000),
      approvedAt: null,
      deniedAt: null,
      deliveredAt: null,
    });

    const pending = await pollAgentCliPairing({
      requestId: "req-poll",
      pollSecret,
    });
    expect(pending).toMatchObject({
      ok: true,
      status: 200,
      data: { status: "pending" },
    });

    prismaMock.agentCliPairingRequest.findUnique.mockResolvedValueOnce({
      id: "req-poll",
      pollSecretHash: sha256(pollSecret),
      expiresAt: new Date(Date.now() + 120_000),
      approvedAt: new Date(),
      deniedAt: null,
      deliveredAt: null,
      approvedByUserId: "owner-1",
      approvedDeviceId: "dev-1",
    });
    txMock.agentRuntimeDevice.findUnique.mockResolvedValueOnce({
      id: "dev-1",
      name: "Laptop A",
      authorizedByUserId: "owner-1",
      scopes: ["task_read", "task_write"],
      canMoveTasksToDone: true,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      identity: {
        id: "oscar",
        label: "Oscar",
        descriptiveLabels: ["Orchestrator"],
        canMoveTasksToDone: true,
        revokedAt: null,
        expiresAt: null,
        scopeGrants: [{ scope: "task_read" }, { scope: "task_write" }],
        project: { id: "proj-1", name: "NexusDash", ownerId: "owner-1" },
      },
    });
    prismaMock.agentCliPairingRequest.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    const delivered = await pollAgentCliPairing({
      requestId: "req-poll",
      pollSecret,
    });
    expect(delivered.ok).toBe(true);
    if (!delivered.ok || delivered.data.status !== "approved") return;
    expect(delivered.data).toMatchObject({
      status: "approved",
      identityId: "oscar",
      identityName: "Oscar",
      deviceId: "dev-1",
      scopes: ["task:read", "task:write"],
      canMoveTasksToDone: true,
    });
    expect(JSON.stringify(delivered.data)).not.toMatch(
      /Secret|tokenHash|runtimeCredential/i
    );

    // Second poll after delivery is rejected as already completed.
    prismaMock.agentCliPairingRequest.findUnique.mockResolvedValueOnce({
      id: "req-poll",
      pollSecretHash: sha256(pollSecret),
      expiresAt: new Date(Date.now() + 120_000),
      approvedAt: new Date(),
      deniedAt: null,
      deliveredAt: new Date(),
      approvedByUserId: "owner-1",
      approvedDeviceId: "dev-1",
    });
    const replay = await pollAgentCliPairing({
      requestId: "req-poll",
      pollSecret,
    });
    expect(replay).toEqual({
      ok: false,
      status: 409,
      error: "pairing-already-completed",
    });
  });
});
