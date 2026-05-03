import { describe, expect, test } from "vitest";

import {
  buildMentionAutocompleteDisplayValue,
  buildMentionAutocompleteValue,
  type MentionAutocompleteMember,
} from "@/components/ui/mention-autocomplete";

describe("buildMentionAutocompleteValue", () => {
  test("preserves username discriminators for unique mention resolution", () => {
    const member: MentionAutocompleteMember = {
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#1234",
      avatarSeed: "user-1",
      role: "editor",
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(member)).toBe("@alice#1234");
  });

  test("can build a display-only mention value without the discriminator", () => {
    const member: MentionAutocompleteMember = {
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#1234",
      avatarSeed: "user-1",
      role: "editor",
      isOwner: false,
    };

    expect(buildMentionAutocompleteDisplayValue(member)).toBe("@alice");
  });

  test("returns an empty value when no resolvable username tag exists", () => {
    const member: MentionAutocompleteMember = {
      id: "user-2",
      displayName: "No Username",
      usernameTag: null,
      avatarSeed: "user-2",
      role: "viewer",
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(member)).toBe("");
    expect(buildMentionAutocompleteDisplayValue(member)).toBe("");
  });
});
