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
        searchMessage: null,
        isMutatingMemberId: null,
        isMutatingInvitationId: null,
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onRoleChange: () => {},
        onRemoveMember: () => {},
        onCopyInvitationLink: () => true,
        onRevokeInvitation: () => {},
      })
    );

    expect(result).toContain("Share access");
    expect(result).toContain("Invite link ready");
    expect(result).toContain("Bound to person@example.com.");
    expect(result).toContain("https://nexusdash.test/invite/project/invite-1");
    expect(result).toContain('aria-label="Copy invite link for person@example.com"');
    expect(result).toContain("Link shown above");
    expect(result).not.toContain(">Copy link<");
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
        isLoadingSharing: false,
        sharingError: null,
        sharingSummary: {
          projectId: "project-1",
          members: [],
          pendingInvitations: [],
        },
        searchMessage: null,
        isMutatingMemberId: null,
        isMutatingInvitationId: null,
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onRoleChange: () => {},
        onRemoveMember: () => {},
        onCopyInvitationLink: () => true,
        onRevokeInvitation: () => {},
      })
    );

    expect(result).toContain("Person Example");
    expect(result).toContain("Access");
    expect(result).not.toContain("Create link");
    expect(result).not.toContain("Press Enter or click below");
  });

  test("avoids repeating owner identity copy when the label already matches", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerSharingPanel, {
        inviteQuery: "",
        inviteEmailCandidate: null,
        inviteRole: "editor",
        inviteResults: [],
        generatedInvitationLink: null,
        isSearchingUsers: false,
        isInvitingUserId: null,
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
        searchMessage: null,
        isMutatingMemberId: null,
        isMutatingInvitationId: null,
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onRoleChange: () => {},
        onRemoveMember: () => {},
        onCopyInvitationLink: () => true,
        onRevokeInvitation: () => {},
      })
    );

    expect(result.match(/dorianagaesse#3762/g)?.length).toBe(1);
    expect(result).not.toContain("Project owner");
    expect(result).toContain("Only you have access right now.");
  });
});
