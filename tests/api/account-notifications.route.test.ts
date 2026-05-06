import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const notificationServiceMock = vi.hoisted(() => ({
  listNotificationsForUser: vi.fn(),
  markAllNotificationsReadForUser: vi.fn(),
  setNotificationReadState: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  listPendingProjectInvitationsForUser: vi.fn(),
  respondToProjectInvitation: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/notification-service", () => ({
  listNotificationsForUser: notificationServiceMock.listNotificationsForUser,
  markAllNotificationsReadForUser:
    notificationServiceMock.markAllNotificationsReadForUser,
  setNotificationReadState: notificationServiceMock.setNotificationReadState,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  listPendingProjectInvitationsForUser:
    collaborationServiceMock.listPendingProjectInvitationsForUser,
  respondToProjectInvitation: collaborationServiceMock.respondToProjectInvitation,
}));

import {
  GET as listNotifications,
  PATCH as updateNotification,
} from "@/app/api/account/notifications/route";
import { POST as markAllRead } from "@/app/api/account/notifications/mark-all-read/route";
import { GET as listInvitations } from "@/app/api/account/invitations/route";
import { POST as respondToInvitation } from "@/app/api/account/invitations/[invitationId]/respond/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function invitationParams(invitationId: string) {
  return { params: Promise.resolve({ invitationId }) };
}

describe("account notification and invitation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("GET notifications returns auth failure response when unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await listNotifications(
      new NextRequest("http://localhost/api/account/notifications")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(notificationServiceMock.listNotificationsForUser).not.toHaveBeenCalled();
  });

  test("GET notifications returns notification data", async () => {
    notificationServiceMock.listNotificationsForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        notifications: [
          {
            id: "notification-1",
            title: "Invitation",
            readAt: null,
          },
        ],
      },
    });

    const response = await listNotifications(
      new NextRequest("http://localhost/api/account/notifications")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      notifications: [
        {
          id: "notification-1",
          title: "Invitation",
          readAt: null,
        },
      ],
    });
    expect(notificationServiceMock.listNotificationsForUser).toHaveBeenCalledWith(
      "user-1"
    );
  });

  test("PATCH notification read state validates payload shape", async () => {
    const response = await updateNotification(
      new NextRequest("http://localhost/api/account/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "notification-1",
          read: "yes",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-payload" });
    expect(notificationServiceMock.setNotificationReadState).not.toHaveBeenCalled();
  });

  test("PATCH notification read state forwards to service", async () => {
    notificationServiceMock.setNotificationReadState.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        notificationId: "notification-1",
        readAt: "2026-05-05T10:00:00.000Z",
      },
    });

    const response = await updateNotification(
      new NextRequest("http://localhost/api/account/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "notification-1",
          read: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      notificationId: "notification-1",
      readAt: "2026-05-05T10:00:00.000Z",
    });
    expect(notificationServiceMock.setNotificationReadState).toHaveBeenCalledWith({
      actorUserId: "user-1",
      notificationId: "notification-1",
      read: true,
    });
  });

  test("POST mark all read forwards to service", async () => {
    notificationServiceMock.markAllNotificationsReadForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        updatedCount: 3,
      },
    });

    const response = await markAllRead(
      new NextRequest("http://localhost/api/account/notifications/mark-all-read", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ updatedCount: 3 });
    expect(
      notificationServiceMock.markAllNotificationsReadForUser
    ).toHaveBeenCalledWith("user-1");
  });

  test("GET invitations returns pending invitations", async () => {
    collaborationServiceMock.listPendingProjectInvitationsForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        invitations: [{ invitationId: "invitation-1", projectName: "Project" }],
      },
    });

    const response = await listInvitations(
      new NextRequest("http://localhost/api/account/invitations")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      invitations: [{ invitationId: "invitation-1", projectName: "Project" }],
    });
    expect(
      collaborationServiceMock.listPendingProjectInvitationsForUser
    ).toHaveBeenCalledWith("user-1");
  });

  test("POST invitation response validates decisions", async () => {
    const response = await respondToInvitation(
      new NextRequest(
        "http://localhost/api/account/invitations/invitation-1/respond",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "maybe" }),
        }
      ),
      invitationParams("invitation-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-decision" });
    expect(collaborationServiceMock.respondToProjectInvitation).not.toHaveBeenCalled();
  });

  test("POST invitation response forwards accepted decisions", async () => {
    collaborationServiceMock.respondToProjectInvitation.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });

    const response = await respondToInvitation(
      new NextRequest(
        "http://localhost/api/account/invitations/invitation-1/respond",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "accept" }),
        }
      ),
      invitationParams("invitation-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ projectId: "project-1" });
    expect(collaborationServiceMock.respondToProjectInvitation).toHaveBeenCalledWith({
      actorUserId: "user-1",
      invitationId: "invitation-1",
      decision: "accept",
    });
  });
});
