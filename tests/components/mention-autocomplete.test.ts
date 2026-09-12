import { describe, expect, test } from "vitest";

import {
  buildMentionAutocompleteDisplayValue,
  buildMentionAutocompleteValue,
  type MentionAutocompleteMember,
} from "@/components/ui/mention-autocomplete";

describe("buildMentionAutocompleteValue", () => {
  test("preserves username discriminators for unique mention resolution", () => {
    const member: MentionAutocompleteMember = {
      kind: "human",
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#1234",
      avatarSeed: "user-1",
      projectRole: "editor",
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(member)).toBe("@alice#1234");
  });

  test("can build a display-only mention value without the discriminator", () => {
    const member: MentionAutocompleteMember = {
      kind: "human",
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#1234",
      avatarSeed: "user-1",
      projectRole: "editor",
      isOwner: false,
    };

    expect(buildMentionAutocompleteDisplayValue(member)).toBe("@alice");
  });

  test("returns an empty value when no resolvable username tag exists", () => {
    const member: MentionAutocompleteMember = {
      kind: "human",
      id: "user-2",
      displayName: "No Username",
      usernameTag: null,
      avatarSeed: "user-2",
      projectRole: "viewer",
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(member)).toBe("");
    expect(buildMentionAutocompleteDisplayValue(member)).toBe("");
  });

  test("serializes discovered agents as braced agent tokens", () => {
    const agent: MentionAutocompleteMember = {
      kind: "agent",
      id: "credential-1",
      displayName: "Release bot",
      usernameTag: null,
      avatarSeed: null,
      projectRole: null,
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(agent)).toBe("@{Release bot}");
    expect(buildMentionAutocompleteDisplayValue(agent)).toBe("@{Release bot}");
  });

  test("returns an empty value for agents with unusable labels", () => {
    const agent: MentionAutocompleteMember = {
      kind: "agent",
      id: "credential-2",
      displayName: "",
      usernameTag: null,
      avatarSeed: null,
      projectRole: null,
      isOwner: false,
    };

    expect(buildMentionAutocompleteValue(agent)).toBe("");
    expect(buildMentionAutocompleteDisplayValue(agent)).toBe("");
  });
});
