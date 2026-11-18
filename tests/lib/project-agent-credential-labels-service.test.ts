import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  apiCredential: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  project: { findUniqueOrThrow: vi.fn() },
  authAuditEvent: { create: vi.fn(), findMany: vi.fn() },
}));
const access = vi.hoisted(() => ({ requireProjectRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/rls-context", () => ({ withActorRlsContext: (_id: string, callback: (client: typeof db) => unknown) => callback(db) }));
vi.mock("@/lib/services/project-access-service", () => access);
vi.mock("@/lib/services/password-service", () => ({ hashSecret: vi.fn().mockResolvedValue("hash"), verifySecret: vi.fn() }));
vi.mock("@/lib/env.server", () => ({ getAgentAccessTokenTtlSeconds: () => 600 }));

import {
  createProjectAgentCredential,
  getProjectAgentAccessSummary,
  updateProjectAgentCredentialDescriptiveLabels,
} from "@/lib/services/project-agent-access-service";

const input = { actorUserId: "owner", projectId: "p", credentialId: "c", descriptiveLabels: ["GPT-6"] };
const record = {
  id: "c", label: "Release bot", descriptiveLabels: ["GPT-6"], publicId: "nda_public",
  expiresAt: null, revokedAt: null, lastUsedAt: null, lastExchangedAt: null, lastRotatedAt: null,
  createdAt: new Date(), updatedAt: new Date(), scopeGrants: [{ scope: "task_read" }],
  secretHash: "must-not-leak",
};
beforeEach(() => {
  vi.clearAllMocks();
  access.requireProjectRole.mockResolvedValue({ ok: true });
  db.apiCredential.findFirst.mockResolvedValue({ id: "c" });
  db.apiCredential.update.mockImplementation(async ({data}) => ({ id: "c", descriptiveLabels: data.descriptiveLabels }));
  db.apiCredential.create.mockResolvedValue(record);
  db.apiCredential.findMany.mockResolvedValue([record]);
  db.project.findUniqueOrThrow.mockResolvedValue({ agentCanMoveTasksToDone: false });
  db.authAuditEvent.findMany.mockResolvedValue([]);
});

describe("owner-managed credential descriptions", () => {
  test("creates and reads metadata while excluding secrets from summaries", async () => {
    const created = await createProjectAgentCredential({ actorUserId: "owner", projectId: "p", label: "Release bot", descriptiveLabels: [" GPT-6 "], scopes: ["task:read"], expiresInDays: null });
    expect(created).toMatchObject({ ok: true, data: { credential: { label: "Release bot", descriptiveLabels: ["GPT-6"] } } });
    expect(db.apiCredential.create.mock.calls[0][0].data.descriptiveLabels).toEqual(["GPT-6"]);
    const summary = await getProjectAgentAccessSummary({ actorUserId: "owner", projectId: "p" });
    expect(summary).toMatchObject({ ok: true, data: { credentials: [ { descriptiveLabels: ["GPT-6"] } ] } });
    expect(JSON.stringify(summary)).not.toContain("secretHash");
    expect(JSON.stringify(summary)).not.toContain("must-not-leak");
  });
  test("edits and clears descriptions without changing credential identity or grants", async () => {
    await expect(updateProjectAgentCredentialDescriptiveLabels({ ...input, descriptiveLabels: [" Codex ", "codex"] })).resolves.toMatchObject({ ok: true, data: { credential: { descriptiveLabels: ["Codex"] } } });
    expect(db.apiCredential.update.mock.calls[0][0].data).toEqual({ descriptiveLabels: ["Codex"] });
    await expect(updateProjectAgentCredentialDescriptiveLabels({ ...input, descriptiveLabels: [] })).resolves.toMatchObject({ ok: true, data: { credential: { descriptiveLabels: [] } } });
    expect(access.requireProjectRole).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "owner", minimumRole: "owner", projectId: "p" }));
  });
  test.each(["editor", "viewer", "outsider"])("denies %s before reading or writing metadata", async (actorUserId) => {
    access.requireProjectRole.mockResolvedValue({ ok: false, status: 403, error: "forbidden" });
    await expect(updateProjectAgentCredentialDescriptiveLabels({ ...input, actorUserId })).resolves.toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(db.apiCredential.findFirst).not.toHaveBeenCalled();
    expect(db.apiCredential.update).not.toHaveBeenCalled();
  });
  test("hides credentials outside the authorized project", async () => {
    db.apiCredential.findFirst.mockResolvedValue(null);
    await expect(updateProjectAgentCredentialDescriptiveLabels(input)).resolves.toEqual({ ok: false, status: 404, error: "credential-not-found" });
    expect(db.apiCredential.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c", projectId: "p" } }));
    expect(db.apiCredential.update).not.toHaveBeenCalled();
  });
  test("rejects malformed or unauthenticated metadata writes", async () => {
    await expect(updateProjectAgentCredentialDescriptiveLabels({ ...input, descriptiveLabels: null })).resolves.toMatchObject({ ok: false, status: 400, error: "invalid-descriptive-labels" });
    await expect(updateProjectAgentCredentialDescriptiveLabels({ ...input, actorUserId: "" })).resolves.toMatchObject({ ok: false, status: 401 });
    expect(db.apiCredential.update).not.toHaveBeenCalled();
  });
});
