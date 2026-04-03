import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerAgentAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-agent-access-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-agent-access-panel quickstart", () => {
  test("renders one-time key reveal and the project bootstrap env block", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerAgentAccessPanel, {
        projectId: "project-1",
        accessSummary: {
          projectId: "project-1",
          accessTokenTtlSeconds: 600,
          credentials: [
            {
              id: "credential-1",
              label: "Release bot",
              publicId: "nda_public",
              scopes: ["task:read", "task:write"],
              status: "active",
              expiresAt: null,
              lastUsedAt: "2026-03-31T09:05:00.000Z",
              lastExchangedAt: "2026-03-31T09:00:00.000Z",
              lastRotatedAt: null,
              revokedAt: null,
              createdAt: "2026-03-31T08:30:00.000Z",
              updatedAt: "2026-03-31T09:05:00.000Z",
            },
          ],
          recentEvents: [],
        },
        isLoadingAccessSummary: false,
        accessError: null,
        isCreatingCredential: false,
        mutatingCredentialId: null,
        latestIssuedSecret: {
          mode: "created",
          credential: {
            id: "credential-1",
            label: "Release bot",
            publicId: "nda_public",
            scopes: ["task:read", "task:write"],
            status: "active",
            expiresAt: null,
            lastUsedAt: null,
            lastExchangedAt: null,
            lastRotatedAt: null,
            revokedAt: null,
            createdAt: "2026-03-31T08:30:00.000Z",
            updatedAt: "2026-03-31T08:30:00.000Z",
          },
          apiKey: "nda_public.secret",
          accessTokenTtlSeconds: 600,
        },
        onCreateCredential: () => {},
        onRotateCredential: () => {},
        onRevokeCredential: () => {},
        onDismissLatestSecret: () => {},
      })
    );

    expect(result).toContain("Project quickstart");
    expect(result).toContain("Hosted docs");
    expect(result).toContain("OpenAPI JSON");
    expect(result).toContain("NEXUSDASH_PROJECT_ID=project-1");
    expect(result).toContain("NEXUSDASH_API_KEY=nda_public.secret");
    expect(result).toContain("Copy the new API key now");
  });
});
