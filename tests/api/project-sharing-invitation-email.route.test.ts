import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  sendProjectInvitationEmailForOwner: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  sendProjectInvitationEmailForOwner:
    collaborationServiceMock.sendProjectInvitationEmailForOwner,
}));

import { POST } from "@/app/api/projects/[projectId]/sharing/invitations/[invitationId]/email/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project sharing invitation email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("returns auth failure response when request is unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/projects/project-1/sharing/invitations/invite-1/email",
        { method: "POST" }
      ),
      { params: { projectId: "project-1", invitationId: "invite-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(
      collaborationServiceMock.sendProjectInvitationEmailForOwner
    ).not.toHaveBeenCalled();
  });

  test("forwards resend context to the collaboration service", async () => {
    collaborationServiceMock.sendProjectInvitationEmailForOwner.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        invitation: {
          invitationId: "invite-1",
        },
        emailDelivery: {
          status: "sent",
          deliveryId: "delivery-1",
          provider: "resend",
          providerMessageId: "provider-1",
          providerStatus: null,
          error: null,
        },
      },
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/projects/project-1/sharing/invitations/invite-1/email",
        {
          method: "POST",
        }
      ),
      { params: { projectId: "project-1", invitationId: "invite-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      invitation: {
        invitationId: "invite-1",
      },
      emailDelivery: {
        status: "sent",
        deliveryId: "delivery-1",
        provider: "resend",
        providerMessageId: "provider-1",
        providerStatus: null,
        error: null,
      },
    });
    expect(
      collaborationServiceMock.sendProjectInvitationEmailForOwner
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      invitationId: "invite-1",
      appOrigin: "http://localhost:3000",
    });
  });

  test("maps service errors to JSON errors", async () => {
    collaborationServiceMock.sendProjectInvitationEmailForOwner.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "invitation-not-active",
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/projects/project-1/sharing/invitations/invite-1/email",
        {
          method: "POST",
        }
      ),
      { params: { projectId: "project-1", invitationId: "invite-1" } }
    );

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toEqual({
      error: "invitation-not-active",
    });
  });
});
