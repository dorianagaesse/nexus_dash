import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOwnerAgentAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-agent-access-panel";

(globalThis as { React?: typeof React }).React = React;

describe("project-dashboard-owner-agent-access-panel", () => {
  test("renders one-time key reveal, credential metadata, and audit events", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectDashboardOwnerAgentAccessPanel, {
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
          recentEvents: [
            {
              id: "audit-1",
              action: "request_used",
              credentialId: "credential-1",
              credentialLabel: "Release bot",
              requestId: "request-123",
              ipAddress: "198.51.100.42",
              userAgent: "Vitest",
              httpMethod: "GET",
              path: "/api/projects/project-1/tasks",
              createdAt: "2026-03-31T09:05:00.000Z",
            },
          ],
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

    expect(result).toContain("Agent access");
    expect(result).toContain("Copy the new API key now");
    expect(result).toContain("nda_public.secret");
    expect(result).toContain("Release bot");
    expect(result).toContain("task:read");
    expect(result).toContain("Request used");
    expect(result).toContain("Request:");
    expect(result).toContain("/api/projects/project-1/tasks");
    expect(result).toContain('aria-label="Copy API key for Release bot"');
  });
});
