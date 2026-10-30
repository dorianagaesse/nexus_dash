import { beforeEach, describe, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ project: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { updateProjectAgentCapabilities } from "@/lib/services/project-agent-access-service";

describe("project agent capability administration", () => {
  beforeEach(() => vi.resetAllMocks());
  test.each(["editor", "viewer"])("rejects %s members before writing", async (role) => {
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [{ role }] });
    const result = await updateProjectAgentCapabilities({ actorUserId: "member", projectId: "project", agentCanMoveTasksToDone: true });
    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(db.project.update).not.toHaveBeenCalled();
  });
  test("hides projects outside the actor's access", async () => {
    db.project.findFirst.mockResolvedValue(null);
    expect(await updateProjectAgentCapabilities({ actorUserId: "outsider", projectId: "project", agentCanMoveTasksToDone: true })).toEqual({ ok: false, status: 404, error: "project-not-found" });
    expect(db.project.update).not.toHaveBeenCalled();
  });
  test.each([true, false])("owner persists %s only on the selected project", async (allowed) => {
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [] });
    db.project.update.mockResolvedValue({ agentCanMoveTasksToDone: allowed });
    expect(await updateProjectAgentCapabilities({ actorUserId: "owner", projectId: "project", agentCanMoveTasksToDone: allowed })).toEqual({ ok: true, status: 200, data: { agentCanMoveTasksToDone: allowed } });
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: "project" }, data: { agentCanMoveTasksToDone: allowed }, select: { agentCanMoveTasksToDone: true } });
  });
});
