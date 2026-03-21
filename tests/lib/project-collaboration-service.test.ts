import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
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

import {
  countPendingProjectInvitationsForUser,
  listPendingProjectInvitationsForUser,
  respondToProjectInvitation,
} from "@/lib/services/project-collaboration-service";

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
      expiresAt: new Date("2099-03-21T00:00:00.000Z"),
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
        expiresAt: new Date("2099-03-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        projectId: "project-1",
        acceptedAt: new Date("2026-03-20T02:00:00.000Z"),
        revokedAt: null,
        expiresAt: new Date("2099-03-21T00:00:00.000Z"),
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

  test("lists pending invitations without relying on direct project row reads", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "invitee@example.com",
      name: "Invitee",
      username: "invitee",
      usernameDiscriminator: "1234",
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        invitationId: "invite-1",
        projectId: "project-1",
        projectName: "Shared Project",
        invitedUserId: "user-1",
        invitedByUserId: "user-2",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
        invitationRole: "editor",
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        expiresAt: new Date("2099-03-21T10:00:00.000Z"),
      },
    ]);

    const result = await listPendingProjectInvitationsForUser("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        invitations: [
          {
            invitationId: "invite-1",
            projectId: "project-1",
            projectName: "Shared Project",
            invitedUserId: "user-1",
            invitedUserDisplayName: "invitee#1234",
            invitedUserUsernameTag: "invitee#1234",
            invitedUserEmail: "invitee@example.com",
            invitedByDisplayName: "owner#4321",
            invitedByUsernameTag: "owner#4321",
            invitedByEmail: "owner@example.com",
            role: "editor",
            createdAt: "2026-03-20T10:00:00.000Z",
            expiresAt: "2099-03-21T10:00:00.000Z",
          },
        ],
      },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("counts pending invitations through the shared metadata function", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ count: 3 }]);

    const result = await countPendingProjectInvitationsForUser("user-1");

    expect(result).toBe(3);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
