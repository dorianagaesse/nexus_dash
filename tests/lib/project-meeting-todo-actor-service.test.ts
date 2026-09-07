import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(),
}));

import { getMeetingTodoParticipantNameKey } from "@/lib/meeting-todo-actor";
import {
  mapStoredMeetingTodoActor,
  resolveExternalParticipantMeetingTodoActor,
} from "@/lib/services/project-meeting-todo-actor-service";

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

  describe("participant assignee mapping", () => {
    test("maps a stored participant assignee against current note participants", () => {
      const current = mapStoredMeetingTodoActor({
        kind: "participant",
        id: null,
        displayNameSnapshot: "Ada Lovelace",
        noteExternalParticipantNameKeys: new Set([
          getMeetingTodoParticipantNameKey("Ada Lovelace"),
        ]),
      });

      expect(current).toMatchObject({
        kind: "participant",
        id: "Ada Lovelace",
        displayName: "Ada Lovelace",
        status: "active",
        isAssignable: true,
      });
    });

    test("marks a stored participant assignee whose name left the note inactive", () => {
      const removed = mapStoredMeetingTodoActor({
        kind: "participant",
        id: null,
        displayNameSnapshot: "Ada Lovelace",
        noteExternalParticipantNameKeys: new Set(),
      });

      expect(removed).toMatchObject({
        kind: "participant",
        status: "inactive",
        isAssignable: false,
      });
    });

    test("matches participant names case-insensitively", () => {
      const actor = mapStoredMeetingTodoActor({
        kind: "participant",
        id: null,
        displayNameSnapshot: "Ada Lovelace",
        noteExternalParticipantNameKeys: new Set([
          getMeetingTodoParticipantNameKey("ada lovelace"),
        ]),
      });

      expect(actor).toMatchObject({ status: "active", isAssignable: true });
    });
  });

  describe("resolveExternalParticipantMeetingTodoActor", () => {
    const participants = [
      { userId: null, displayName: "Ada Lovelace" },
      { userId: null, displayName: "Grace Hopper" },
      { userId: "user-1", displayName: "Owner" },
    ];

    test("resolves a current external participant by normalized name", () => {
      const result = resolveExternalParticipantMeetingTodoActor({
        reference: { kind: "participant", id: "  ada   lovelace " },
        participants,
      });

      expect(result).toEqual({
        ok: true,
        actor: {
          userId: null,
          credentialId: null,
          displayNameSnapshot: "Ada Lovelace",
          summary: expect.objectContaining({
            kind: "participant",
            displayName: "Ada Lovelace",
            status: "active",
            isAssignable: true,
          }),
        },
      });
    });

    test("rejects names that are not external participants of the note", () => {
      expect(
        resolveExternalParticipantMeetingTodoActor({
          reference: { kind: "participant", id: "Alan Turing" },
          participants,
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "meeting-note-action-assignee-invalid",
      });

      expect(
        resolveExternalParticipantMeetingTodoActor({
          reference: { kind: "participant", id: "Owner" },
          participants,
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "meeting-note-action-assignee-invalid",
      });
    });

    test("rejects non-participant references", () => {
      expect(
        resolveExternalParticipantMeetingTodoActor({
          reference: { kind: "human", id: "user-1" },
          participants,
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "meeting-note-action-assignee-invalid",
      });
    });
  });
});
