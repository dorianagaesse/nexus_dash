import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerSharingPanel } from "@/components/project-dashboard/project-dashboard-owner-sharing-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-sharing-panel", () => {
  test("renders a one-step create-and-copy CTA for direct email invites", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerSharingPanel, {
        inviteQuery: "person@example.com",
        inviteEmailCandidate: "person@example.com",
        inviteRole: "editor",
        inviteResults: [],
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
        onCopyInvitationLink: () => {},
        onRevokeInvitation: () => {},
      })
    );

    expect(result).toContain("Create and copy link");
    expect(result).toContain(
      "Press Enter or click below to create and copy an invite link immediately."
    );
    expect(result).toContain(
      "Create an email-bound invitation and copy its link in one step."
    );
  });
});
