import { beforeEach, describe, expect, test, vi } from "vitest";
import { effectiveProjectCapabilities, isValidCapabilityGrant, roleCapabilities } from "@/lib/project-capabilities";
const db = vi.hoisted(() => ({ project: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { requireProjectRole, requireAgentProjectScopes } from "@/lib/services/project-access-service";

beforeEach(() => vi.resetAllMocks());
describe("project module access", () => {
  test("preserves role presets while explicit empty and malformed grants deny access", () => {
    expect(effectiveProjectCapabilities("editor", null)).toEqual(roleCapabilities("editor"));
    expect(effectiveProjectCapabilities("editor", [])).toEqual([]);
    expect(effectiveProjectCapabilities("editor", { task: "write" })).toEqual([]);
    expect(effectiveProjectCapabilities("viewer", ["task:read", "task:write"])).toEqual(["task:read"]);
    expect(isValidCapabilityGrant(["task:write"], "editor")).toBe(false);
    expect(isValidCapabilityGrant(["task:read", "task:delete"], "editor")).toBe(false);
    expect(isValidCapabilityGrant(["unknown:read"], "editor")).toBe(false);
  });
  test("a restricted editor can edit tasks but cannot read context or manage sharing", async () => {
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [{ role: "editor", capabilities: ["task:read", "task:write"] }] });
    const principal = { actorUserId: "member", projectId: "project" };
    expect((await requireProjectRole({ ...principal, minimumRole: "editor", capability: "task:write" })).ok).toBe(true);
    expect(await requireProjectRole({ ...principal, minimumRole: "viewer", capability: "context:read" })).toMatchObject({ ok: false, status: 403 });
    expect(await requireProjectRole({ ...principal, minimumRole: "owner" })).toMatchObject({ ok: false, status: 403 });
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [{ role: "editor", capabilities: [] }] });
    expect((await requireProjectRole({ ...principal, minimumRole: "viewer", capability: "task:read" })).ok).toBe(false);
  });
  test("only the actual project owner gets owner access; outside membership is hidden", async () => {
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [{ role: "owner", capabilities: [] }] });
    expect((await requireProjectRole({ actorUserId: "owner", projectId: "p", minimumRole: "owner", capability: "task:delete" })).ok).toBe(true);
    expect((await requireProjectRole({ actorUserId: "member", projectId: "p", minimumRole: "owner" })).ok).toBe(false);
    db.project.findFirst.mockResolvedValue(null);
    expect(await requireProjectRole({ actorUserId: "outsider", projectId: "p", minimumRole: "viewer", capability: "task:read" })).toMatchObject({ ok: false, status: 404 });
  });
  test("task scopes no longer grant meeting or epic access; grants stay project-bound", () => {
    const agentAccess = { credentialId: "agent", projectId: "p", scopes: ["task:read", "task:write"] as const };
    for (const scope of ["meeting:read", "epic:write", "schedule:read"] as const) {
      expect(requireAgentProjectScopes({ agentAccess: { ...agentAccess, scopes: [...agentAccess.scopes] }, projectId: "p", requiredScopes: [scope] })).toMatchObject({ ok: false, status: 403 });
    }
    expect(requireAgentProjectScopes({ agentAccess: { ...agentAccess, scopes: ["epic:read"] }, projectId: "other", requiredScopes: ["epic:read"] })).toMatchObject({ ok: false, status: 404 });
  });
});
