import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerSharingPanel } from "@/components/project-dashboard/project-dashboard-owner-sharing-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-sharing-panel", () => {
  test("renders an invitation-sent state for direct email invites", () => {
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
          emailDelivery: {
            status: "sent",
            deliveryId: "delivery-1",
            provider: "resend",
            providerMessageId: "provider-1",
            providerStatus: null,
            error: null,
          },
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
    expect(result).toContain("Invitation sent");
    expect(result).toContain(
      "Sent to person@example.com with a link that expires in 24 hours."
    );
    expect(result).toContain("Invitation email sent.");
    expect(result).not.toContain("https://nexusdash.test/invite/project/invite-1");
    expect(result).not.toContain(
      'aria-label="Copy invite link for person@example.com"'
    );
  });

  test("keeps copy-link fallback visible when direct email delivery fails", () => {
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
          emailDelivery: {
            status: "failed",
            deliveryId: "delivery-1",
            provider: "resend",
            providerMessageId: null,
            providerStatus: null,
            error: "provider-unavailable",
          },
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

    expect(result).toContain("Invitation ready");
    expect(result).toContain("Bound to person@example.com.");
    expect(result).toContain("Email provider unavailable.");
    expect(result).toContain("https://nexusdash.test/invite/project/invite-1");
    expect(result).toContain('aria-label="Copy invite link for person@example.com"');
  });

  test("renders a send-invitation CTA for email addresses without an account match", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerSharingPanel, {
        inviteQuery: "newperson@example.com",
        inviteEmailCandidate: "newperson@example.com",
        inviteRole: "editor",
        inviteResults: [],
        generatedInvitationLink: null,
        isSearchingUsers: false,
        isInvitingUserId: null,
        searchMessage: "No verified account found yet. Send an invitation below.",
        onInviteQueryChange: () => {},
        onInviteRoleChange: () => {},
        onInviteByEmail: () => {},
        onInvite: () => {},
        onCopyInvitationLink: () => true,
      })
    );

    expect(result).toContain("newperson@example.com");
    expect(result).toContain("Send an invitation email with a 24-hour link.");
    expect(result).toContain("Send invitation");
    expect(result).not.toContain("Create link");
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
            avatarSeed: "user-1",
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
    expect(result).not.toContain("Send invitation");
    expect(result).not.toContain("Press Enter or click below");
  });
});
