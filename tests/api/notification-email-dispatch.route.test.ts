import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const envMock = vi.hoisted(() => ({
  getNotificationEmailDispatchSecret: vi.fn(),
  isPreviewDeployment: vi.fn(),
}));

const dispatchMock = vi.hoisted(() => ({
  dispatchProjectNotificationEmails: vi.fn(),
}));

const requestOriginMock = vi.hoisted(() => ({
  resolveRequestOriginFromHeaders: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  getNotificationEmailDispatchSecret:
    envMock.getNotificationEmailDispatchSecret,
  isPreviewDeployment: envMock.isPreviewDeployment,
}));

vi.mock("@/lib/http/request-origin", () => ({
  resolveRequestOriginFromHeaders: requestOriginMock.resolveRequestOriginFromHeaders,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: vi.fn(),
}));

vi.mock("@/lib/services/project-notification-email-service", () => ({
  dispatchProjectNotificationEmails:
    dispatchMock.dispatchProjectNotificationEmails,
}));

import { GET } from "@/app/api/cron/notification-emails/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("notification email dispatch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.getNotificationEmailDispatchSecret.mockReturnValue(
      "dispatch-secret-0123456789abcdef"
    );
    envMock.isPreviewDeployment.mockReturnValue(false);
    requestOriginMock.resolveRequestOriginFromHeaders.mockReturnValue(
      "https://nexus-dash.app"
    );
    dispatchMock.dispatchProjectNotificationEmails.mockResolvedValue({
      usersScanned: 1,
      digestsAttempted: 1,
      digestsSent: 1,
      digestsSkipped: 0,
      digestsFailed: 0,
      invitationRemindersAttempted: 0,
      invitationRemindersSent: 0,
      invitationRemindersSkipped: 0,
      invitationRemindersFailed: 0,
      errors: 0,
    });
  });

  test("rejects requests when dispatch secret is missing", async () => {
    envMock.getNotificationEmailDispatchSecret.mockReturnValueOnce(null);

    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails")
    );

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toEqual({
      error: "notification-email-dispatch-secret-missing",
    });
    expect(dispatchMock.dispatchProjectNotificationEmails).not.toHaveBeenCalled();
  });

  test("rejects requests with the wrong bearer token", async () => {
    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails", {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(dispatchMock.dispatchProjectNotificationEmails).not.toHaveBeenCalled();
  });

  test("rejects requests with the wrong dispatch secret header", async () => {
    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails", {
        headers: {
          "x-notification-email-dispatch-secret": "wrong-secret",
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(dispatchMock.dispatchProjectNotificationEmails).not.toHaveBeenCalled();
  });

  test("dispatches notification emails with the trusted app origin", async () => {
    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails", {
        headers: {
          authorization: "Bearer dispatch-secret-0123456789abcdef",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      ok: true,
      summary: {
        usersScanned: 1,
        digestsAttempted: 1,
        digestsSent: 1,
        digestsSkipped: 0,
        digestsFailed: 0,
        invitationRemindersAttempted: 0,
        invitationRemindersSent: 0,
        invitationRemindersSkipped: 0,
        invitationRemindersFailed: 0,
        errors: 0,
      },
    });
    expect(dispatchMock.dispatchProjectNotificationEmails).toHaveBeenCalledWith({
      appOrigin: "https://nexus-dash.app",
    });
  });

  test("accepts bearer token auth with case-insensitive scheme and extra spaces", async () => {
    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails", {
        headers: {
          authorization: "  bearer   dispatch-secret-0123456789abcdef  ",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
    });
    expect(dispatchMock.dispatchProjectNotificationEmails).toHaveBeenCalledWith({
      appOrigin: "https://nexus-dash.app",
    });
  });

  test("dispatches notification emails with the dedicated dispatch secret header", async () => {
    const response = await GET(
      new NextRequest("https://nexus-dash.app/api/cron/notification-emails", {
        headers: {
          "x-notification-email-dispatch-secret":
            " dispatch-secret-0123456789abcdef ",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
    });
    expect(dispatchMock.dispatchProjectNotificationEmails).toHaveBeenCalledWith({
      appOrigin: "https://nexus-dash.app",
    });
  });

  test("uses the preview request origin during preview dispatch", async () => {
    envMock.isPreviewDeployment.mockReturnValueOnce(true);

    const response = await GET(
      new NextRequest(
        "https://preview-url.vercel.app/api/cron/notification-emails",
        {
          headers: {
            authorization: "Bearer dispatch-secret-0123456789abcdef",
          },
        }
      )
    );

    expect(response.status).toBe(200);
    expect(dispatchMock.dispatchProjectNotificationEmails).toHaveBeenCalledWith({
      appOrigin: "https://preview-url.vercel.app",
    });
    expect(
      requestOriginMock.resolveRequestOriginFromHeaders
    ).not.toHaveBeenCalled();
  });
});
