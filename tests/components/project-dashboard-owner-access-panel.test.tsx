import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-access-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-access-panel", () => {
  test("avoids repeating owner identity copy when the label already matches", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerAccessPanel, {
        isLoadingSharing: false,
        sharingError: null,
        sharingSummary: {
          projectId: "project-1",
          members: [
            {
              id: "user-1",
              membershipId: "membership-1",
              displayName: "dorianagaesse#3762",
              usernameTag: "dorianagaesse#3762",
              email: "dorian@example.com",
              role: "owner",
              joinedAt: "2026-03-25T10:00:00.000Z",
              isOwner: true,
            },
          ],
          pendingInvitations: [],
        },
        isMutatingMemberId: null,
        isMutatingInvitationId: null,
        onRoleChange: () => {},
        onRemoveMember: () => {},
        onCopyInvitationLink: () => true,
        onRevokeInvitation: () => {},
      })
    );

    expect(result.match(/dorianagaesse#3762/g)?.length).toBe(1);
    expect(result).not.toContain("Project owner");
    expect(result).toContain("Only you are on this project right now.");
  });

  test("renders the inline copy control for pending email invitations", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerAccessPanel, {
        isLoadingSharing: false,
        sharingError: null,
        sharingSummary: {
          projectId: "project-1",
          members: [],
          pendingInvitations: [
            {
              invitationId: "invite-1",
              projectId: "project-1",
              projectName: "Project One",
              invitedEmail: "person@example.com",
              invitedUserId: null,
              invitedUserDisplayName: null,
              invitedUserUsernameTag: null,
              invitedByDisplayName: "Owner",
              invitedByUsernameTag: "owner#1234",
              invitedByEmail: "owner@example.com",
              role: "editor",
              createdAt: "2026-03-25T10:00:00.000Z",
              expiresAt: "2026-04-08T10:00:00.000Z",
              inviteLinkPath: "/invite/project/invite-1",
            },
          ],
        },
        isMutatingMemberId: null,
        isMutatingInvitationId: null,
        onRoleChange: () => {},
        onRemoveMember: () => {},
        onCopyInvitationLink: () => true,
        onRevokeInvitation: () => {},
      })
    );

    expect(result).toContain("Contributors");
    expect(result).toContain("Pending");
    expect(result).toContain('aria-label="Invite link for person@example.com"');
    expect(result).toContain('aria-label="Copy invite link for person@example.com"');
    expect(result).toContain("/invite/project/invite-1");
  });
});
