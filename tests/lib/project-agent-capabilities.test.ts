import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  authAuditEvent: { create: vi.fn() },
  project: {
    findFirst: vi.fn(),
  },
  apiCredential: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { updateProjectAgentCredentialCapabilities } from "@/lib/services/project-agent-access-service";

describe("project agent capability administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  test.each(["editor", "viewer"])(
    "rejects %s members before writing",
    async (role) => {
      db.project.findFirst.mockResolvedValue({
        ownerId: "owner",
        memberships: [{ role }],
      });

      const result = await updateProjectAgentCredentialCapabilities({
        actorUserId: "member",
        projectId: "project",
        credentialId: "credential",
        canMoveTasksToDone: true,
      });

      expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
      expect(db.apiCredential.updateMany).not.toHaveBeenCalled();
      expect(db.authAuditEvent.create).not.toHaveBeenCalled();
    }
  );

  test("hides projects outside the actor's access", async () => {
    db.project.findFirst.mockResolvedValue(null);

    const result = await updateProjectAgentCredentialCapabilities({
      actorUserId: "outsider",
      projectId: "project",
      credentialId: "credential",
      canMoveTasksToDone: true,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
    expect(db.apiCredential.updateMany).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    "owner persists %s only on the selected project",
    async (allowed) => {
      db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [] });
      db.apiCredential.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateProjectAgentCredentialCapabilities({
        actorUserId: "owner",
        projectId: "project",
        credentialId: "credential",
        canMoveTasksToDone: allowed,
      });

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: { canMoveTasksToDone: allowed },
      });
      expect(db.apiCredential.updateMany).toHaveBeenCalledWith({
        where: { id: "credential", projectId: "project" },
        data: { canMoveTasksToDone: allowed },
      });
      expect(db.authAuditEvent.create).toHaveBeenCalledWith({
        data: {
          projectId: "project", credentialId: "credential", actorUserId: "owner",
          actorKind: "human", action: "credential_capabilities_updated",
          requestId: null, ipAddress: null, userAgent: null,
          metadata: { canMoveTasksToDone: allowed },
        },
      });
    }
  );
  test("does not update a credential from another project", async () => {
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [] });
    db.apiCredential.updateMany.mockResolvedValue({ count: 0 });
    const result = await updateProjectAgentCredentialCapabilities({
      actorUserId: "owner", projectId: "project", credentialId: "foreign", canMoveTasksToDone: true,
    });
    expect(result).toEqual({ ok: false, status: 404, error: "credential-not-found" });
    expect(db.authAuditEvent.create).not.toHaveBeenCalled();
    expect(db.apiCredential.updateMany).toHaveBeenCalledWith({
      where: { id: "foreign", projectId: "project" }, data: { canMoveTasksToDone: true },
    });
  });

});
