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
  test("renders member count, current actor role, and generated avatars", () => {
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
            avatarSeed: "seed-editor",
            projectRole: "editor",
          }),
        ],
      })
    );

    expect(result).toContain("Project collaborators");
    expect(result).toContain("2 members");
    expect(result).toContain("You are editor");
    expect(result).toContain("Editor (you)");
    expect(result).toContain("Owner");
    expect(result).toContain("data:image/svg+xml");
    expect(result).toContain('<ul aria-hidden="true"');
  });

  test("limits visible members and reports overflow", () => {
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

    expect(result).toContain("6 members");
    expect(result).toContain("+1");
    expect(result).toContain("+2 more");
    expect(result).toContain("user-1 (you)");
    expect(result).not.toContain(">user-5<");
    expect(result).not.toContain(">user-6<");
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
