import { beforeEach, describe, expect, test, vi } from "vitest";

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
  },
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const notificationServiceMock = vi.hoisted(() => ({
  createProjectInvitationNotification: vi.fn(),
  resolveProjectInvitationNotifications: vi.fn(),
}));

const outboundEmailServiceMock = vi.hoisted(() => ({
  sendOutboundEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/notification-service", () => ({
  createProjectInvitationNotification:
    notificationServiceMock.createProjectInvitationNotification,
  resolveProjectInvitationNotifications:
    notificationServiceMock.resolveProjectInvitationNotifications,
}));

vi.mock("@/lib/services/outbound-email-service", () => ({
  sendOutboundEmail: outboundEmailServiceMock.sendOutboundEmail,
}));

import {
  countPendingProjectInvitationsForUser,
  getProjectInvitationRecipientView,
  inviteUserToProject,
  listPendingProjectInvitationsForUser,
  respondToProjectInvitation,
  searchProjectMembersForMention,
  sendProjectInvitationEmailForOwner,
} from "@/lib/services/project-collaboration-service";

describe("project-collaboration-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sends project invitation email after creating an invite", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.projectInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Launch Plan",
      owner: {
        email: "owner@example.com",
      },
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        email: "owner@example.com",
      })
      .mockResolvedValueOnce(null);
    prismaMock.projectMembership.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectInvitation.findMany.mockResolvedValueOnce([]);
    prismaMock.projectInvitation.create.mockResolvedValueOnce({
      id: "invite-1",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "editor",
      createdAt: new Date("2026-05-07T10:00:00.000Z"),
      expiresAt: new Date("2026-05-21T10:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Launch Plan",
      },
      invitedByUser: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        username: "owner",
        usernameDiscriminator: "1234",
      },
    });
    outboundEmailServiceMock.sendOutboundEmail.mockResolvedValueOnce({
      ok: true,
      delivery: "sent",
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "provider-1",
    });

    const result = await inviteUserToProject({
      actorUserId: "owner-1",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "editor",
      appOrigin: "https://nexusdash.test",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: {
        invitation: {
          invitationId: "invite-1",
          invitedEmail: "invitee@example.com",
          inviteLinkPath: "/invite/project/invite-1",
        },
        emailDelivery: {
          status: "sent",
          deliveryId: "delivery-1",
          providerMessageId: "provider-1",
          error: null,
        },
      },
    });
    expect(outboundEmailServiceMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "project_invitation",
        to: "invitee@example.com",
        metadata: {
          invitationId: "invite-1",
          projectId: "project-1",
          invitedByUserId: "owner-1",
          triggeredByUserId: "owner-1",
          role: "editor",
        },
      })
    );
    expect(outboundEmailServiceMock.sendOutboundEmail.mock.calls[0][0].text).toContain(
      "https://nexusdash.test/invite/project/invite-1"
    );
  });

  test("keeps a created invite when project invitation email delivery fails", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.projectInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Launch Plan",
      owner: {
        email: "owner@example.com",
      },
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        email: "owner@example.com",
      })
      .mockResolvedValueOnce(null);
    prismaMock.projectMembership.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectInvitation.findMany.mockResolvedValueOnce([]);
    prismaMock.projectInvitation.create.mockResolvedValueOnce({
      id: "invite-2",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "viewer",
      createdAt: new Date("2026-05-07T10:00:00.000Z"),
      expiresAt: new Date("2026-05-21T10:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Launch Plan",
      },
      invitedByUser: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        username: "owner",
        usernameDiscriminator: "1234",
      },
    });
    outboundEmailServiceMock.sendOutboundEmail.mockResolvedValueOnce({
      ok: false,
      error: "provider-unavailable",
      deliveryId: "delivery-2",
      provider: "resend",
    });

    const result = await inviteUserToProject({
      actorUserId: "owner-1",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "viewer",
      appOrigin: "https://nexusdash.test",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: {
        invitation: {
          invitationId: "invite-2",
        },
        emailDelivery: {
          status: "failed",
          deliveryId: "delivery-2",
          error: "provider-unavailable",
        },
      },
    });
    expect(prismaMock.projectInvitation.create).toHaveBeenCalledTimes(1);
  });

  test("rejects unsafe invite email origins without calling outbound provider", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.projectInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Launch Plan",
      owner: {
        email: "owner@example.com",
      },
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        email: "owner@example.com",
      })
      .mockResolvedValueOnce(null);
    prismaMock.projectMembership.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectInvitation.findMany.mockResolvedValueOnce([]);
    prismaMock.projectInvitation.create.mockResolvedValueOnce({
      id: "invite-unsafe-origin",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "viewer",
      createdAt: new Date("2026-05-07T10:00:00.000Z"),
      expiresAt: new Date("2026-05-21T10:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Launch Plan",
      },
      invitedByUser: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        username: "owner",
        usernameDiscriminator: "1234",
      },
    });

    const result = await inviteUserToProject({
      actorUserId: "owner-1",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "viewer",
      appOrigin: "javascript:alert(1)",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: {
        invitation: {
          invitationId: "invite-unsafe-origin",
        },
        emailDelivery: {
          status: "failed",
          deliveryId: null,
          error: "invite-url-unavailable",
        },
      },
    });
    expect(outboundEmailServiceMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("resends email for an active pending project invitation", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.projectInvitation.findUnique.mockResolvedValueOnce({
      id: "invite-3",
      projectId: "project-1",
      invitedEmail: "verified@example.com",
      role: "editor",
      createdAt: new Date("2026-05-07T10:00:00.000Z"),
      expiresAt: new Date("2099-05-21T10:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Launch Plan",
      },
      invitedByUser: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        username: "owner",
        usernameDiscriminator: "1234",
      },
    });
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: "invitee-1",
        email: "verified@example.com",
        name: "Verified",
        username: "verified",
        usernameDiscriminator: "5678",
        avatarSeed: null,
      },
    ]);
    outboundEmailServiceMock.sendOutboundEmail.mockResolvedValueOnce({
      ok: true,
      delivery: "skipped",
      deliveryId: "delivery-3",
      provider: "resend",
      providerMessageId: null,
    });

    const result = await sendProjectInvitationEmailForOwner({
      actorUserId: "owner-1",
      projectId: "project-1",
      invitationId: "invite-3",
      appOrigin: "https://nexusdash.test",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      data: {
        invitation: {
          invitedUserId: "invitee-1",
          invitedUserDisplayName: "verified#5678",
        },
        emailDelivery: {
          status: "skipped",
          deliveryId: "delivery-3",
          error: null,
        },
      },
    });
    expect(outboundEmailServiceMock.sendOutboundEmail).toHaveBeenCalledTimes(1);
    expect(outboundEmailServiceMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          invitationId: "invite-3",
          projectId: "project-1",
          invitedByUserId: "owner-1",
          triggeredByUserId: "owner-1",
          role: "editor",
        },
      })
    );
  });

  test("rejects resend for inactive project invitations", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.projectInvitation.findUnique.mockResolvedValueOnce({
      id: "invite-4",
      projectId: "project-1",
      invitedEmail: "invitee@example.com",
      role: "editor",
      createdAt: new Date("2026-05-07T10:00:00.000Z"),
      expiresAt: new Date("2099-05-21T10:00:00.000Z"),
      acceptedAt: new Date("2026-05-08T10:00:00.000Z"),
      revokedAt: null,
      replacedAt: null,
      project: {
        id: "project-1",
        name: "Launch Plan",
      },
      invitedByUser: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        username: "owner",
        usernameDiscriminator: "1234",
      },
    });

    const result = await sendProjectInvitationEmailForOwner({
      actorUserId: "owner-1",
      projectId: "project-1",
      invitationId: "invite-4",
      appOrigin: "https://nexusdash.test",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "invitation-not-active",
    });
    expect(outboundEmailServiceMock.sendOutboundEmail).not.toHaveBeenCalled();
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
