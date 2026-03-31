import { describe, expect, test } from "vitest";

import {
  hasRequiredRole,
  requireAgentProjectScopes,
} from "@/lib/services/project-access-service";

describe("project-access-service", () => {
  test("allows human callers when no agent scope context is present", () => {
    expect(
      requireAgentProjectScopes({
        agentAccess: undefined,
        projectId: "project-1",
        requiredScopes: ["task:read"],
      })
    ).toEqual({ ok: true });
  });

  test("denies cross-project agent access with a not-found boundary", () => {
    expect(
      requireAgentProjectScopes({
        agentAccess: {
          credentialId: "credential-1",
          projectId: "project-1",
          scopes: ["task:read", "task:write"],
        },
        projectId: "project-2",
        requiredScopes: ["task:read"],
      })
    ).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
  });

  test("denies missing agent scopes", () => {
    expect(
      requireAgentProjectScopes({
        agentAccess: {
          credentialId: "credential-1",
          projectId: "project-1",
          scopes: ["task:read"],
        },
        projectId: "project-1",
        requiredScopes: ["task:delete"],
      })
    ).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
  });

  test("orders project membership roles correctly", () => {
    expect(hasRequiredRole("owner", "editor")).toBe(true);
    expect(hasRequiredRole("editor", "viewer")).toBe(true);
    expect(hasRequiredRole("viewer", "editor")).toBe(false);
  });
});
