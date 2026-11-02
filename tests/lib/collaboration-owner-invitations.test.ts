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
  },
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
  inviteUserToProject,
  sendProjectInvitationEmailForOwner,
} from "@/lib/services/collaboration/owner-invitations";

describe("collaboration/owner-invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("sends project invitation email after creating an invite", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T10:00:00.000Z"));

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
      expiresAt: new Date("2026-05-08T10:00:00.000Z"),
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
    expect(prismaMock.projectInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date("2026-05-08T10:00:00.000Z"),
        }),
      })
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
      expiresAt: new Date("2026-05-08T10:00:00.000Z"),
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
      expiresAt: new Date("2026-05-08T10:00:00.000Z"),
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
});
