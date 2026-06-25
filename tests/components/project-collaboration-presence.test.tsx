import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ProjectCollaborationPresence } from "@/components/project-dashboard/project-collaboration-presence";
import type { ProjectCollaboratorIdentitySummary } from "@/lib/services/project-service";

(globalThis as { React?: typeof React }).React = React;

function buildMember(
  overrides: Partial<ProjectCollaboratorIdentitySummary> & {
    id: string;
  }
): ProjectCollaboratorIdentitySummary {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    usernameTag: overrides.usernameTag ?? null,
    avatarSeed: overrides.avatarSeed ?? overrides.id,
    projectRole: overrides.projectRole ?? "viewer",
  };
}

describe("project-collaboration-presence", () => {
  test("renders avatars with username hover titles", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectCollaborationPresence, {
        actorUserId: "user-2",
        members: [
          buildMember({
            id: "user-1",
            displayName: "Owner",
            projectRole: "owner",
          }),
          buildMember({
            id: "user-2",
            displayName: "Editor",
            usernameTag: "editor-handle",
            avatarSeed: "seed-editor",
            projectRole: "editor",
          }),
        ],
      })
    );

    expect(result).toContain("Project collaborators");
    expect(result).toContain("data:image/svg+xml");
    expect(result).toContain('title="editor-handle"');
    expect(result).not.toContain("2 members");
    expect(result).not.toContain("You are editor");
    expect(result).not.toContain("<ul");
  });

  test("keeps all member identities available without non-avatar overflow rows", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectCollaborationPresence, {
        actorUserId: "user-1",
        members: [
          buildMember({ id: "user-1", projectRole: "owner" }),
          buildMember({ id: "user-2", projectRole: "editor" }),
          buildMember({ id: "user-3", projectRole: "viewer" }),
          buildMember({ id: "user-4", projectRole: "viewer" }),
          buildMember({ id: "user-5", projectRole: "viewer" }),
          buildMember({ id: "user-6", projectRole: "viewer" }),
        ],
      })
    );

    expect(result).not.toContain("+1");
    expect(result).not.toContain("+2 more");
    expect(result).toContain("user-1 (you)");
    expect(result).toContain('title="user-5"');
    expect(result).toContain('title="user-6"');
  });

  test("renders nothing when there are no visible members", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectCollaborationPresence, {
        actorUserId: "user-1",
        members: [],
      })
    );

    expect(result).toBe("");
  });
});
