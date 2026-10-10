import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const notificationServiceMock = vi.hoisted(() => ({
  getNotificationRealtimeSnapshotForUser: vi.fn(),
  listNotificationsForUser: vi.fn(),
  markAllNotificationsReadForUser: vi.fn(),
  setNotificationReadState: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  listPendingProjectInvitationsForUser: vi.fn(),
  respondToProjectInvitation: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());
const logServerInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerInfo: logServerInfoMock,
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/notification-service", () => ({
  getNotificationRealtimeSnapshotForUser:
    notificationServiceMock.getNotificationRealtimeSnapshotForUser,
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
import {
  getRealtimeMetricsSnapshot,
  resetRealtimeMetricsForTests,
} from "@/lib/observability/realtime-metrics";
import { POST as markAllRead } from "@/app/api/account/notifications/mark-all-read/route";
import { GET as getNotificationSummary } from "@/app/api/account/notifications/summary/route";
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
    resetRealtimeMetricsForTests();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  test("GET notification summary counts snapshot checks and reports service timing", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "polling");
    notificationServiceMock.getNotificationRealtimeSnapshotForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        version: "2026-06-04T10:00:00.000Z",
        unreadCount: 0,
        serverTime: "2026-06-04T10:00:00.000Z",
      },
    });

    const response = await getNotificationSummary(
      new NextRequest("http://localhost/api/account/notifications/summary")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("server-timing")).toMatch(
      /^account.notifications.poll;dur=\d+\.\d$/
    );

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["notifications.snapshotChecks"]).toBe(1);
    expect(snapshot.counters["notifications.pollingFallbacks"]).toBe(0);
    expect(snapshot.serviceTiming["account.notifications.poll"]?.count).toBe(1);
  });

  test("GET notification summary counts polling fallbacks while Broadcast is active", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    notificationServiceMock.getNotificationRealtimeSnapshotForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        version: "2026-06-04T10:00:00.000Z",
        unreadCount: 0,
        serverTime: "2026-06-04T10:00:00.000Z",
      },
    });

    await getNotificationSummary(
      new NextRequest("http://localhost/api/account/notifications/summary")
    );

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["notifications.snapshotChecks"]).toBe(1);
    expect(snapshot.counters["notifications.pollingFallbacks"]).toBe(1);
  });

  test("Broadcast subscribe reconciliation does not count as polling fallback", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    notificationServiceMock.getNotificationRealtimeSnapshotForUser.mockResolvedValueOnce({
      ok: true, status: 200,
      data: { version: "2026-06-04T10:00:00.000Z", unreadCount: 0,
        latestUnreadNotification: null, serverTime: "2026-06-04T10:00:00.000Z" },
    });
    await getNotificationSummary(new NextRequest(
      "http://localhost/api/account/notifications/summary",
      { headers: { "x-realtime-reconcile": "1" } }
    ));
    expect(getRealtimeMetricsSnapshot().counters["notifications.pollingFallbacks"]).toBe(0);
  });

  test("GET notifications list stays out of poll telemetry (reconciliation fetch)", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
    notificationServiceMock.listNotificationsForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { notifications: [] },
    });

    const response = await listNotifications(
      new NextRequest("http://localhost/api/account/notifications")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toBeNull();

    const snapshot = getRealtimeMetricsSnapshot();
    expect(snapshot.counters["notifications.snapshotChecks"]).toBe(0);
    expect(snapshot.counters["notifications.pollingFallbacks"]).toBe(0);
    expect(snapshot.serviceTiming["account.notifications.poll"]).toBeUndefined();
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

  test("PATCH notification read state rejects invalid json payloads", async () => {
    const response = await updateNotification(
      new NextRequest("http://localhost/api/account/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
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

  test("GET notification summary returns realtime snapshot data", async () => {
    notificationServiceMock.getNotificationRealtimeSnapshotForUser.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        version: "2026-06-04T10:00:00.000Z",
        unreadCount: 2,
        latestUnreadNotification: { title: "Assigned: Ship realtime" },
        serverTime: "2026-06-04T10:00:00.000Z",
      },
    });

    const response = await getNotificationSummary(
      new NextRequest("http://localhost/api/account/notifications/summary")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readJson(response)).resolves.toEqual({
      version: "2026-06-04T10:00:00.000Z",
      unreadCount: 2,
      latestUnreadNotification: { title: "Assigned: Ship realtime" },
      serverTime: "2026-06-04T10:00:00.000Z",
    });
    expect(
      notificationServiceMock.getNotificationRealtimeSnapshotForUser
    ).toHaveBeenCalledWith("user-1");
  });

  test("GET notification summary does not cache service errors", async () => {
    notificationServiceMock.getNotificationRealtimeSnapshotForUser.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "notification-snapshot-failed",
    });

    const response = await getNotificationSummary(
      new NextRequest("http://localhost/api/account/notifications/summary")
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readJson(response)).resolves.toEqual({
      error: "notification-snapshot-failed",
    });
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
