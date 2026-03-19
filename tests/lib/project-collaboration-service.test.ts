import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  projectInvitation: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  projectMembership: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { respondToProjectInvitation } from "@/lib/services/project-collaboration-service";

describe("project-collaboration-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("treats already accepted invitations as idempotent success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });
    prismaMock.projectInvitation.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      projectId: "project-1",
      role: "editor",
      invitedUserId: "user-1",
      acceptedAt: new Date("2026-03-20T01:00:00.000Z"),
      revokedAt: null,
      expiresAt: new Date("2026-03-21T00:00:00.000Z"),
    });

    const result = await respondToProjectInvitation({
      actorUserId: "user-1",
      invitationId: "invite-1",
      decision: "accept",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    expect(prismaMock.projectMembership.create).not.toHaveBeenCalled();
    expect(prismaMock.projectInvitation.updateMany).not.toHaveBeenCalled();
  });

  test("accepts invitation idempotently when membership creation loses a race", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });
    prismaMock.projectInvitation.findUnique
      .mockResolvedValueOnce({
        id: "invite-1",
        projectId: "project-1",
        role: "editor",
        invitedUserId: "user-1",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date("2026-03-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        projectId: "project-1",
        acceptedAt: new Date("2026-03-20T02:00:00.000Z"),
        revokedAt: null,
        expiresAt: new Date("2026-03-21T00:00:00.000Z"),
      });
    prismaMock.projectMembership.findUnique.mockResolvedValueOnce(null);
    prismaMock.projectMembership.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.projectInvitation.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await respondToProjectInvitation({
      actorUserId: "user-1",
      invitationId: "invite-1",
      decision: "accept",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    expect(prismaMock.projectMembership.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.projectInvitation.updateMany).toHaveBeenCalledTimes(1);
  });
});
