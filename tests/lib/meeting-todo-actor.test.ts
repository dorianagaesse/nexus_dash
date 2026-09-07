import { describe, expect, test } from "vitest";

import {
  buildExternalParticipantMeetingTodoActor,
  getHistoricalMeetingTodoActorId,
  getMeetingTodoActorKey,
  getMeetingTodoParticipantNameKey,
  isMeetingTodoActorReference,
} from "@/lib/meeting-todo-actor";

describe("meeting-todo-actor participant support", () => {
  describe("buildExternalParticipantMeetingTodoActor", () => {
    test("builds an active assignable actor for a current external participant", () => {
      expect(
        buildExternalParticipantMeetingTodoActor({
          displayName: "  Ada   Lovelace ",
          isCurrentParticipant: true,
        })
      ).toEqual({
        kind: "participant",
        id: "Ada Lovelace",
        displayName: "Ada Lovelace",
        usernameTag: null,
        avatarSeed: null,
        status: "active",
        isAssignable: true,
      });
    });

    test("marks a participant who is no longer on the note inactive", () => {
      expect(
        buildExternalParticipantMeetingTodoActor({
          displayName: "Ada Lovelace",
          isCurrentParticipant: false,
        })
      ).toMatchObject({
        kind: "participant",
        status: "inactive",
        isAssignable: false,
      });
    });

    test("falls back to a placeholder when the display name is blank", () => {
      expect(
        buildExternalParticipantMeetingTodoActor({
          displayName: "   ",
          isCurrentParticipant: true,
        })
      ).toMatchObject({
        id: "Former meeting participant",
        displayName: "Former meeting participant",
        status: "inactive",
        isAssignable: false,
      });
    });
  });

  describe("getMeetingTodoParticipantNameKey", () => {
    test("folds whitespace and case for case-insensitive matching", () => {
      expect(getMeetingTodoParticipantNameKey("  Ada   Lovelace ")).toBe(
        "ada lovelace"
      );
      expect(getMeetingTodoParticipantNameKey("ADA LOVELACE")).toBe(
        "ada lovelace"
      );
    });
  });

  describe("isMeetingTodoActorReference", () => {
    test("accepts participant references", () => {
      expect(
        isMeetingTodoActorReference({ kind: "participant", id: "Ada Lovelace" })
      ).toBe(true);
    });

    test("rejects malformed or unknown-kind references", () => {
      expect(isMeetingTodoActorReference({ kind: "human", id: "" })).toBe(false);
      expect(isMeetingTodoActorReference({ kind: "bot", id: "x" })).toBe(false);
      expect(isMeetingTodoActorReference({ kind: "participant" })).toBe(false);
      expect(isMeetingTodoActorReference(null)).toBe(false);
    });
  });

  describe("getMeetingTodoActorKey", () => {
    test("prefixes the kind so participant ids never collide", () => {
      expect(getMeetingTodoActorKey({ kind: "participant", id: "Ada" })).toBe(
        "participant:Ada"
      );
    });
  });

  describe("getHistoricalMeetingTodoActorId", () => {
    test("encodes snapshots with the participant kind prefix", () => {
      expect(
        getHistoricalMeetingTodoActorId({
          kind: "participant",
          displayNameSnapshot: "Ada Lovelace",
        })
      ).toBe("historical-participant-Ada%20Lovelace");
    });
  });
});
