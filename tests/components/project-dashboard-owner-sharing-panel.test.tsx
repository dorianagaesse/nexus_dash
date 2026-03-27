import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerSharingPanel } from "@/components/project-dashboard/project-dashboard-owner-sharing-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-sharing-panel", () => {
  test("renders an inline generated-link state for direct email invites", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerSharingPanel, {
        inviteQuery: "person@example.com",
        inviteEmailCandidate: "person@example.com",
        inviteRole: "editor",
        inviteResults: [],
        generatedInvitationLink: {
          invitation: {
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
          url: "https://nexusdash.test/invite/project/invite-1",
        },
        isSearchingUsers: false,
        isInvitingUserId: null,
        searchMessage: null,
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onCopyInvitationLink: () => true,
      })
    );

    expect(result).toContain("Share access");
    expect(result).toContain("Invite link ready");
    expect(result).toContain("Bound to person@example.com.");
    expect(result).toContain("https://nexusdash.test/invite/project/invite-1");
    expect(result).toContain('aria-label="Copy invite link for person@example.com"');
  });

  test("hides the raw email create-link row when a verified user matches exactly", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerSharingPanel, {
        inviteQuery: "person@example.com",
        inviteEmailCandidate: "person@example.com",
        inviteRole: "editor",
        inviteResults: [
          {
            id: "user-1",
            displayName: "Person Example",
            usernameTag: "person#1234",
            email: "person@example.com",
          },
        ],
        generatedInvitationLink: null,
        isSearchingUsers: false,
        isInvitingUserId: null,
        searchMessage: null,
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onCopyInvitationLink: () => true,
      })
    );

    expect(result).toContain("Person Example");
    expect(result).not.toContain("Create link");
    expect(result).not.toContain("Press Enter or click below");
  });
});
