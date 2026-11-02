import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  projectInvitation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  projectMembership: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const offboardingMock = vi.hoisted(() => ({
  resolveActiveProjectResponsibilities: vi.fn(),
}));

vi.mock("@/lib/services/project-offboarding-service", () => offboardingMock);

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  removeProjectMember,
  searchProjectMembersForMention,
  updateProjectMemberRole,
} from "@/lib/services/collaboration/project-membership";

describe("collaboration/project-membership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("rejects membership changes by editors before reading the member", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      ownerId: "owner-1",
      memberships: [{ role: "editor" }],
    });

    expect(await updateProjectMemberRole({
      actorUserId: "editor-1", projectId: "project-1", membershipId: "member-1", role: "viewer",
    })).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(prismaMock.projectMembership.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.projectMembership.update).not.toHaveBeenCalled();
  });

  test("hides a membership belonging to another project", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ ownerId: "owner-1", memberships: [] });
    prismaMock.projectMembership.findUnique.mockResolvedValue({
      id: "member-1", projectId: "project-2", userId: "member-user", role: "viewer",
    });

    expect(await updateProjectMemberRole({
      actorUserId: "owner-1", projectId: "project-1", membershipId: "member-1", role: "editor",
    })).toEqual({ ok: false, status: 404, error: "member-not-found" });
    expect(prismaMock.projectMembership.update).not.toHaveBeenCalled();
  });

  test("does not remove a member whose responsibilities still need resolution", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ ownerId: "owner-1", memberships: [] });
    prismaMock.projectMembership.findUnique.mockResolvedValue({
      id: "member-1", projectId: "project-1", userId: "member-user", role: "editor",
    });
    const failure = { ok: false, status: 409, error: "responsibility-resolution-required" };
    offboardingMock.resolveActiveProjectResponsibilities.mockResolvedValue(failure);

    expect(await removeProjectMember({
      actorUserId: "owner-1", projectId: "project-1", membershipId: "member-1",
    })).toEqual(failure);
    expect(prismaMock.projectMembership.delete).not.toHaveBeenCalled();
  });

  test("resolves responsibilities with the same client before deleting membership", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ ownerId: "owner-1", memberships: [] });
    prismaMock.projectMembership.findUnique.mockResolvedValue({
      id: "member-1", projectId: "project-1", userId: "member-user", role: "editor",
    });
    const inventory = { taskAssignments: 1, meetingNoteStewardships: 0, meetingTodoAssignments: 0, total: 1 };
    offboardingMock.resolveActiveProjectResponsibilities.mockImplementation(async (input) => {
      expect(input).toEqual({
        db: prismaMock, projectId: "project-1", actor: { kind: "human", id: "member-user" },
        actingUserId: "owner-1", resolution: { mode: "unassign" },
      });
      expect(prismaMock.projectMembership.delete).not.toHaveBeenCalled();
      return { ok: true, status: 200, data: { inventory } };
    });

    expect(await removeProjectMember({
      actorUserId: "owner-1", projectId: "project-1", membershipId: "member-1",
      responsibilityResolution: { mode: "unassign" },
    })).toEqual({ ok: true, status: 200, data: { ok: true, resolvedInventory: inventory } });
    expect(prismaMock.projectMembership.delete).toHaveBeenCalledWith({ where: { id: "member-1" } });
  });

  test("includes the actor in member search for agent callers", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      ownerId: "owner-1",
      owner: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Dorian",
        username: "dorianagaesse",
        usernameDiscriminator: "4589",
        avatarSeed: null,
      },
      memberships: [],
    });

    const result = await searchProjectMembersForMention({
      actorUserId: "owner-1",
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:write"],
      },
      projectId: "project-1",
      query: "dorianagaesse",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        members: [
          {
            id: "owner-1",
            displayName: "dorianagaesse#4589",
            usernameTag: "dorianagaesse#4589",
            email: "owner@example.com",
            avatarSeed: "owner-1",
            membershipId: "",
            role: "owner",
            joinedAt: "2026-04-01T00:00:00.000Z",
            isOwner: true,
          },
        ],
      },
    });
  });
});
