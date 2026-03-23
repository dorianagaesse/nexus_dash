import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  projectInvitation: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  projectMembership: {
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  countPendingProjectInvitationsForUser,
  getProjectInvitationRecipientView,
  listPendingProjectInvitationsForUser,
  respondToProjectInvitation,
} from "@/lib/services/project-collaboration-service";

describe("project-collaboration-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("treats already accepted invitations as idempotent success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "invitee@example.com",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });
    prismaMock.projectInvitation.findUnique.mockResolvedValueOnce({
      id: "invite-1",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "editor",
      acceptedAt: new Date("2026-03-20T01:00:00.000Z"),
      revokedAt: null,
      replacedAt: null,
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
      email: "invitee@example.com",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });
    prismaMock.projectInvitation.findUnique
      .mockResolvedValueOnce({
        id: "invite-1",
        projectId: "project-1",
        invitedEmail: "invitee@example.com",
        role: "editor",
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
        expiresAt: new Date("2099-03-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        projectId: "project-1",
        acceptedAt: new Date("2026-03-20T02:00:00.000Z"),
        revokedAt: null,
        replacedAt: null,
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
    expect(prismaMock.projectMembership.deleteMany).not.toHaveBeenCalled();
  });

  test("removes a just-created membership when invitation acceptance loses to revocation", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: "invitee@example.com",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
    });
    prismaMock.projectInvitation.findUnique
      .mockResolvedValueOnce({
        id: "invite-1",
        projectId: "project-1",
        invitedEmail: "invitee@example.com",
        role: "editor",
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
        expiresAt: new Date("2099-03-21T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        projectId: "project-1",
        acceptedAt: null,
        revokedAt: new Date("2026-03-20T02:00:00.000Z"),
        replacedAt: null,
        expiresAt: new Date("2099-03-21T00:00:00.000Z"),
      });
    prismaMock.projectMembership.findUnique.mockResolvedValueOnce(null);
    prismaMock.projectMembership.create.mockResolvedValueOnce({
      id: "membership-1",
    });
    prismaMock.projectInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.projectMembership.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await respondToProjectInvitation({
      actorUserId: "user-1",
      invitationId: "invite-1",
      decision: "accept",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "invitation-revoked",
    });
    expect(prismaMock.projectMembership.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.projectMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        userId: "user-1",
      },
    });
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
        invitedEmail: "invitee@example.com",
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
            invitedEmail: "invitee@example.com",
            invitedUserId: "user-1",
            invitedUserDisplayName: "invitee#1234",
            invitedUserUsernameTag: "invitee#1234",
            invitedByDisplayName: "owner#4321",
            invitedByUsernameTag: "owner#4321",
            invitedByEmail: "owner@example.com",
            role: "editor",
            createdAt: "2026-03-20T10:00:00.000Z",
            expiresAt: "2099-03-21T10:00:00.000Z",
            inviteLinkPath: "/invite/project/invite-1",
          },
        ],
      },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("counts pending invitations through the shared metadata function", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { invitationId: "invite-1" },
      { invitationId: "invite-2" },
      { invitationId: "invite-3" },
    ]);

    const result = await countPendingProjectInvitationsForUser("user-1");

    expect(result).toBe(3);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("returns a sign-in-required recipient view for active email-bound invitations", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        invitationId: "invite-1",
        projectId: "project-1",
        projectName: "Shared Project",
        invitedEmail: "invitee@example.com",
        invitationRole: "viewer",
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        expiresAt: new Date("2099-03-21T10:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
        invitedByUserId: "owner-1",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
      },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([]);

    const result = await getProjectInvitationRecipientView({
      invitationId: "invite-1",
    });

    expect(result).toEqual({
      state: "sign-in-required",
      invitation: {
        invitationId: "invite-1",
        projectId: "project-1",
        projectName: "Shared Project",
        invitedEmail: "invitee@example.com",
        invitedUserId: null,
        invitedUserDisplayName: null,
        invitedUserUsernameTag: null,
        invitedByDisplayName: "owner#4321",
        invitedByUsernameTag: "owner#4321",
        invitedByEmail: "owner@example.com",
        role: "viewer",
        createdAt: "2026-03-20T10:00:00.000Z",
        expiresAt: "2099-03-21T10:00:00.000Z",
        inviteLinkPath: "/invite/project/invite-1",
      },
      actor: null,
      actorEmailVerified: false,
      actorEmailMatchesInvitation: false,
    });
  });

  test("returns a wrong-account recipient view when the signed-in email does not match", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        invitationId: "invite-2",
        projectId: "project-2",
        projectName: "Shared Project",
        invitedEmail: "invitee@example.com",
        invitationRole: "editor",
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        expiresAt: new Date("2099-03-21T10:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        replacedAt: null,
        invitedByUserId: "owner-1",
        invitedByEmail: "owner@example.com",
        invitedByName: "Owner",
        invitedByUsername: "owner",
        invitedByUsernameDiscriminator: "4321",
      },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-2",
      email: "other@example.com",
      emailVerified: new Date("2026-03-20T00:00:00.000Z"),
      name: "Other User",
      username: "other",
      usernameDiscriminator: "1111",
    });

    const result = await getProjectInvitationRecipientView({
      invitationId: "invite-2",
      actorUserId: "user-2",
    });

    expect(result.state).toBe("wrong-account");
    expect(result.actor?.email).toBe("other@example.com");
    expect(result.actorEmailMatchesInvitation).toBe(false);
    expect(result.invitation?.invitedEmail).toBe("invitee@example.com");
  });
});
