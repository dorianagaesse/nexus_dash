import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(),
}));

import { mapStoredMeetingTodoActor } from "@/lib/services/project-meeting-todo-actor-service";

describe("project-meeting-todo-actor-service", () => {
  test.each([
    ["human", "Former owner", "historical-human-Former%20owner"],
    ["agent", "Release:bot", "historical-agent-Release%3Abot"],
  ] as const)(
    "keeps a stable non-empty identity for a deleted %s actor",
    (kind, displayNameSnapshot, expectedId) => {
      const actor = mapStoredMeetingTodoActor({
        kind,
        id: null,
        displayNameSnapshot,
      });

      expect(actor).toMatchObject({
        kind,
        id: expectedId,
        displayName: displayNameSnapshot,
        isAssignable: false,
      });
    }
  );
});
