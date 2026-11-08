import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProjectDashboardOwnerAgentAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-agent-access-panel";

(globalThis as { React?: typeof React }).React = React;
const props: ComponentProps<typeof ProjectDashboardOwnerAgentAccessPanel> = {
  projectId: "project-1",
  accessSummary: {
    projectId: "project-1",
    accessTokenTtlSeconds: 600,
    recentEvents: [],
    credentials: [
      {
        id: "credential-1",
        label: "Release assistant",
        publicId: "nda_public",
        canMoveTasksToDone: false,
        scopes: ["project:read", "task:read", "task:write"],
        status: "active",
        expiresAt: null,
        lastUsedAt: null,
        lastExchangedAt: null,
        lastRotatedAt: null,
        revokedAt: null,
        createdAt: "2026-11-05T09:00:00Z",
        updatedAt: "2026-11-05T09:00:00Z",
      },
    ],
  },
  isLoadingAccessSummary: false,
  accessLoadError: null,
  actionError: null,
  onClearActionError: () => {},
  onRefreshAccess: () => {},
  onUpdateCapabilities: () => {},
  isCreatingCredential: false,
  mutatingCredentialId: null,
  latestIssuedSecret: null,
  onCreateCredential: () => {},
  onRotateCredential: () => {},
  onRevokeCredential: () => {},
  onDismissLatestSecret: () => {},
};

describe("Agent access directory", () => {
  test("puts human-readable access and per-agent completion ahead of setup details", () => {
    const result = renderToStaticMarkup(
      <ProjectDashboardOwnerAgentAccessPanel {...props} />
    );
    expect(result).toContain("Release assistant");
    expect(result).toContain("Read &amp; write");
    expect(result).toContain("Review required");
    expect(result).toContain("Allow Release assistant to move tasks to Done");
    expect(result).toContain("New credential");
    expect(result).toContain("Setup guide");
    expect(result).not.toContain("nda_public");
    expect(result).not.toContain("NEXUSDASH_API_KEY");
    expect(result).not.toContain("Customize permissions");
  });

  test("shows a loading state instead of implying the project has no agents", () => {
    const result = renderToStaticMarkup(
      <ProjectDashboardOwnerAgentAccessPanel
        {...props}
        accessSummary={null}
        isLoadingAccessSummary
      />
    );
    expect(result).toContain("Loading credentials...");
    expect(result).not.toContain("Invite your first agent");
  });

  test("makes load failures actionable without showing a misleading empty directory", () => {
    const result = renderToStaticMarkup(
      <ProjectDashboardOwnerAgentAccessPanel
        {...props}
        accessSummary={null}
        accessLoadError="Could not load credentials. Please retry."
      />
    );
    expect(result).toContain('aria-label="Credential loading error"');
    expect(result).toContain("Retry loading credentials");
    expect(result).not.toContain("Invite your first agent");
  });
});
