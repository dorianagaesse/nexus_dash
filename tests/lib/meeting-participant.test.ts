import { describe, expect, test } from "vitest";

import {
  getMeetingParticipantInitials,
  getMeetingParticipantKey,
  normalizeMeetingParticipantName,
} from "@/lib/meeting-participant";

describe("meeting participant helpers", () => {
  test("normalizes multi-word names without splitting them", () => {
    expect(normalizeMeetingParticipantName("  Firstname   Name  ")).toBe(
      "Firstname Name"
    );
  });

  test("builds readable initials from one or several words", () => {
    expect(getMeetingParticipantInitials("Camille")).toBe("C");
    expect(getMeetingParticipantInitials("Dorian Agaesse")).toBe("DA");
    expect(getMeetingParticipantInitials("  Élodie   du Pont ")).toBe("ÉP");
  });

  test("uses user ids for linked identities and normalized names for guests", () => {
    expect(
      getMeetingParticipantKey({
        userId: "user-2",
        displayName: "Camille",
      })
    ).toBe("user:user-2");
    expect(
      getMeetingParticipantKey({
        userId: null,
        displayName: "  Camille Example ",
      })
    ).toBe("external:camille example");
  });
});
