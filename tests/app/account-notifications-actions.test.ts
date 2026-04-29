import { beforeEach, describe, expect, test, vi } from "vitest";

const authGuardMock = vi.hoisted(() => ({
  requireVerifiedSessionUserIdFromServer: vi.fn(),
}));

const notificationServiceMock = vi.hoisted(() => ({
  markAllNotificationsReadForUser: vi.fn(),
  setNotificationReadState: vi.fn(),
}));

const projectCollaborationServiceMock = vi.hoisted(() => ({
  respondToProjectInvitation: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/server-guard", () => ({
  requireVerifiedSessionUserIdFromServer:
    authGuardMock.requireVerifiedSessionUserIdFromServer,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

vi.mock("@/lib/services/notification-service", () => ({
  markAllNotificationsReadForUser:
    notificationServiceMock.markAllNotificationsReadForUser,
  setNotificationReadState: notificationServiceMock.setNotificationReadState,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  respondToProjectInvitation:
    projectCollaborationServiceMock.respondToProjectInvitation,
}));

import {
  acceptNotificationInvitationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/account/notifications/actions";

describe("account notification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGuardMock.requireVerifiedSessionUserIdFromServer.mockResolvedValue("user-1");
    notificationServiceMock.setNotificationReadState.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        notificationId: "notification-1",
        readAt: "2026-04-29T08:00:00.000Z",
      },
    });
    notificationServiceMock.markAllNotificationsReadForUser.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        updatedCount: 2,
      },
    });
    projectCollaborationServiceMock.respondToProjectInvitation.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("marks a notification read and redirects back to notification center", async () => {
    const formData = new FormData();
    formData.set("notificationId", "notification-1");

    await expect(markNotificationReadAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account/notifications?status=notification-read"
    );

    expect(notificationServiceMock.setNotificationReadState).toHaveBeenCalledWith({
      actorUserId: "user-1",
      notificationId: "notification-1",
      read: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account/notifications");
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects");
  });

  test("marks all visible notifications read", async () => {
    await expect(markAllNotificationsReadAction()).rejects.toThrow(
      "NEXT_REDIRECT:/account/notifications?status=notifications-read"
    );

    expect(
      notificationServiceMock.markAllNotificationsReadForUser
    ).toHaveBeenCalledWith("user-1");
  });

  test("accepts invitation notifications through collaboration service", async () => {
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(acceptNotificationInvitationAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/account/notifications?status=invitation-accepted"
    );

    expect(projectCollaborationServiceMock.respondToProjectInvitation).toHaveBeenCalledWith({
      actorUserId: "user-1",
      invitationId: "invite-1",
      decision: "accept",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/project-1");
  });
});
