import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const collaborationServiceMock = vi.hoisted(() => ({
  respondToProjectInvitation: vi.fn(),
  buildProjectInvitationReturnToPath: vi.fn((invitationId: string) => {
    return `/invite/project/${invitationId}`;
  }),
}));

const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

vi.mock("@/lib/services/project-collaboration-service", () => ({
  respondToProjectInvitation: collaborationServiceMock.respondToProjectInvitation,
  buildProjectInvitationReturnToPath:
    collaborationServiceMock.buildProjectInvitationReturnToPath,
}));

import {
  acceptProjectInvitationFromLinkAction,
  declineProjectInvitationFromLinkAction,
} from "@/app/invite/project/[invitationId]/actions";

describe("invite project link actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValue("user-1");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  test("redirects signed-out users to sign in with the invite return path", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(
      acceptProjectInvitationFromLinkAction(formData)
    ).rejects.toThrow(
      "NEXT_REDIRECT:/?form=signin&returnTo=%2Finvite%2Fproject%2Finvite-1"
    );
  });

  test("redirects verified invite acceptance to the project", async () => {
    collaborationServiceMock.respondToProjectInvitation.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(
      acceptProjectInvitationFromLinkAction(formData)
    ).rejects.toThrow(
      "NEXT_REDIRECT:/projects/project-1?status=invitation-accepted"
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects");
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/project-1");
  });

  test("redirects unverified invite acceptance to verify-email with returnTo", async () => {
    collaborationServiceMock.respondToProjectInvitation.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "email-unverified",
    });
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(
      acceptProjectInvitationFromLinkAction(formData)
    ).rejects.toThrow(
      "NEXT_REDIRECT:/verify-email?returnTo=%2Finvite%2Fproject%2Finvite-1"
    );
  });

  test("redirects declined invitations back to account", async () => {
    collaborationServiceMock.respondToProjectInvitation.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
      },
    });
    const formData = new FormData();
    formData.set("invitationId", "invite-1");

    await expect(
      declineProjectInvitationFromLinkAction(formData)
    ).rejects.toThrow("NEXT_REDIRECT:/account?status=invitation-declined");
  });
});
