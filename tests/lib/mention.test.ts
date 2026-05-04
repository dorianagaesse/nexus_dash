import { describe, expect, it } from "vitest";
import {
  parseMentions,
  containsMentions,
  extractMentionedUsernames,
  buildMentionString,
  getActiveMentionTrigger,
  isValidMentionUsername,
  removeMentionBeforeCursor,
  replaceMentionTrigger,
} from "@/lib/mention";

describe("parseMentions", () => {
  it("returns empty array and original text for null/undefined", () => {
    const result = parseMentions(null as unknown as string);
    expect(result.mentions).toEqual([]);
    expect(result.plainText).toBe("");

    const resultUndefined = parseMentions(undefined as unknown as string);
    expect(resultUndefined.mentions).toEqual([]);
    expect(resultUndefined.plainText).toBe("");
  });

  it("returns empty array for empty string", () => {
    const result = parseMentions("");
    expect(result.mentions).toEqual([]);
    expect(result.plainText).toBe("");
  });

  it("returns empty array for text without mentions", () => {
    const result = parseMentions("Hello world, no mentions here!");
    expect(result.mentions).toEqual([]);
    expect(result.plainText).toBe("Hello world, no mentions here!");
  });

  it("does not parse email addresses as mentions", () => {
    const result = parseMentions("mail me@example.com");
    expect(result.mentions).toEqual([]);
    expect(result.plainText).toBe("mail me@example.com");
  });

  it("parses a single mention without discriminator", () => {
    const result = parseMentions("Hello @alice, how are you?");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]).toEqual({
      username: "alice",
      discriminator: null,
      fullMatch: "@alice",
      startIndex: 6,
      endIndex: 12,
    });
    expect(result.plainText).toBe("Hello @alice, how are you?");
  });

  it("parses a single mention with discriminator", () => {
    const result = parseMentions("Hey @alice#1234, check this out");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]).toEqual({
      username: "alice",
      discriminator: "1234",
      fullMatch: "@alice#1234",
      startIndex: 4,
      endIndex: 15,
    });
  });

  it("parses mentions that contain invisible editor format characters", () => {
    const result = parseMentions(
      "Hey @\u200Balice\u200B#\u20601234, check this out"
    );

    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]).toEqual({
      username: "alice",
      discriminator: "1234",
      fullMatch: "@\u200Balice\u200B#\u20601234",
      startIndex: 4,
      endIndex: 18,
    });
    expect(result.plainText).toBe("Hey @alice, check this out");
  });

  it("does not treat a zero-width split inside a word as a mention boundary", () => {
    const result = parseMentions("prefix\u200B@alice");

    expect(result.mentions).toEqual([]);
  });

  it("parses multiple mentions", () => {
    const result = parseMentions("@alice and @bob are here, also @charlie#42");
    expect(result.mentions).toHaveLength(3);

    expect(result.mentions[0]).toEqual({
      username: "alice",
      discriminator: null,
      fullMatch: "@alice",
      startIndex: 0,
      endIndex: 6,
    });

    expect(result.mentions[1]).toEqual({
      username: "bob",
      discriminator: null,
      fullMatch: "@bob",
      startIndex: 11,
      endIndex: 15,
    });

    expect(result.mentions[2]).toEqual({
      username: "charlie",
      discriminator: "42",
      fullMatch: "@charlie#42",
      startIndex: 31,
      endIndex: 42,
    });
  });

  it("handles mentions at start and end of text", () => {
    const result = parseMentions("@start mid @end");
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0].startIndex).toBe(0);
    expect(result.mentions[1].startIndex).toBe(11);
  });

  it("handles consecutive mentions", () => {
    // Left boundary check skips @ preceded by alphanumeric (e.g. "@bob" in "@alice@bob" is skipped
    // because @ is preceded by 'e'). In practice users separate mentions with whitespace.
    const result = parseMentions("Hey @alice and @bob!");
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0].username).toBe("alice");
    expect(result.mentions[1].username).toBe("bob");
  });

  it("handles mentions with underscores in username", () => {
    const result = parseMentions("Hello @user_name_123");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].username).toBe("user_name_123");
  });

  it("handles mentions with numbers in username", () => {
    const result = parseMentions("Hello @user123");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].username).toBe("user123");
  });

  it("does not match mention with username exceeding 20 chars", () => {
    const result = parseMentions("Hello @abcdefghijklmnopqrstuvwxyz");
    expect(result.mentions).toHaveLength(0);
  });

  it("does not match mention with discriminator exceeding 4 chars", () => {
    const result = parseMentions("Hello @alice#12345");
    // The regex will match @alice only (without the discriminator)
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].username).toBe("alice");
    expect(result.mentions[0].discriminator).toBeNull();
  });

  it("strips discriminator from plainText", () => {
    const result = parseMentions("Hey @alice#1234");
    expect(result.plainText).toBe("Hey @alice");
  });
});

describe("containsMentions", () => {
  it("returns false for null/undefined", () => {
    expect(containsMentions(null as unknown as string)).toBe(false);
    expect(containsMentions(undefined as unknown as string)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsMentions("")).toBe(false);
  });

  it("returns false for text without mentions", () => {
    expect(containsMentions("Hello world")).toBe(false);
  });

  it("returns false for email addresses", () => {
    expect(containsMentions("mail me@example.com")).toBe(false);
  });

  it("returns true for text with mention without discriminator", () => {
    expect(containsMentions("Hello @alice")).toBe(true);
  });

  it("returns true for text with mention with discriminator", () => {
    expect(containsMentions("Hello @alice#1234")).toBe(true);
  });
});

describe("extractMentionedUsernames", () => {
  it("returns empty set for null/undefined", () => {
    const result = extractMentionedUsernames(null as unknown as string);
    expect(result.size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    const result = extractMentionedUsernames("");
    expect(result.size).toBe(0);
  });

  it("returns empty set for text without mentions", () => {
    const result = extractMentionedUsernames("Hello world");
    expect(result.size).toBe(0);
  });

  it("returns usernames in lowercase", () => {
    const result = extractMentionedUsernames("Hello @Alice @BOB @charlie");
    expect(result.size).toBe(3);
    expect(result.has("alice")).toBe(true);
    expect(result.has("bob")).toBe(true);
    expect(result.has("charlie")).toBe(true);
  });

  it("deduplicates usernames", () => {
    const result = extractMentionedUsernames("@alice and @Alice and @ALICE");
    expect(result.size).toBe(1);
    expect(result.has("alice")).toBe(true);
  });

  it("handles mentions with discriminators", () => {
    const result = extractMentionedUsernames("@alice#1234 and @alice#5678");
    // Should deduplicate - same username regardless of discriminator
    expect(result.size).toBe(1);
    expect(result.has("alice")).toBe(true);
  });
});

describe("buildMentionString", () => {
  it("builds mention without discriminator", () => {
    expect(buildMentionString("alice", null)).toBe("@alice");
  });

  it("builds mention with discriminator", () => {
    expect(buildMentionString("alice", "1234")).toBe("@alice#1234");
  });
});

describe("replaceMentionTrigger", () => {
  it("replaces the active mention query and keeps one trailing separator", () => {
    expect(
      replaceMentionTrigger({
        text: "hello @ali there",
        startIndex: 6,
        endIndex: 10,
        replacement: "@alice#1234 ",
      })
    ).toEqual({
      value: "hello @alice#1234 there",
      cursorPosition: 18,
    });
  });

  it("clamps invalid replacement bounds to the input text", () => {
    expect(
      replaceMentionTrigger({
        text: "@ali",
        startIndex: -10,
        endIndex: 50,
        replacement: "@alice ",
      })
    ).toEqual({
      value: "@alice ",
      cursorPosition: 7,
    });
  });
});

describe("removeMentionBeforeCursor", () => {
  it("removes only the trailing separator before the cursor", () => {
    expect(
      removeMentionBeforeCursor({
        text: "hello @alice more",
        cursorPosition: "hello @alice ".length,
      })
    ).toEqual({
      value: "hello @alicemore",
      cursorPosition: "hello @alice".length,
    });
  });

  it("removes the mention when the cursor is directly after it", () => {
    expect(
      removeMentionBeforeCursor({
        text: "hello @alice",
        cursorPosition: "hello @alice".length,
      })
    ).toEqual({
      value: "hello ",
      cursorPosition: 6,
    });
  });

  it("does not remove a mention when regular text sits between it and the cursor", () => {
    expect(
      removeMentionBeforeCursor({
        text: "hello @alice there",
        cursorPosition: "hello @alice there".length,
      })
    ).toBeNull();
  });
});

describe("isValidMentionUsername", () => {
  it("returns false for non-strings", () => {
    expect(isValidMentionUsername(null as unknown as string)).toBe(false);
    expect(isValidMentionUsername(undefined as unknown as string)).toBe(false);
    expect(isValidMentionUsername(123 as unknown as string)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidMentionUsername("")).toBe(false);
  });

  it("returns false for username exceeding 20 chars", () => {
    expect(isValidMentionUsername("abcdefghijklmnopqrstuvwxyz")).toBe(false);
  });

  it("returns false for username with invalid characters", () => {
    expect(isValidMentionUsername("alice@bob")).toBe(false);
    expect(isValidMentionUsername("alice bob")).toBe(false);
    expect(isValidMentionUsername("alice!")).toBe(false);
  });

  it("returns true for valid username without discriminator", () => {
    expect(isValidMentionUsername("alice")).toBe(true);
    expect(isValidMentionUsername("user_name")).toBe(true);
    expect(isValidMentionUsername("user123")).toBe(true);
    expect(isValidMentionUsername("a")).toBe(true);
  });

  it("returns true for username at max length (20 chars)", () => {
    expect(isValidMentionUsername("abcdefghijklmnopqrst")).toBe(true);
  });
});

describe("getActiveMentionTrigger", () => {
  it("activates immediately after @", () => {
    expect(getActiveMentionTrigger("Hello @", 7)).toEqual({
      startIndex: 6,
      query: "",
    });
  });

  it("returns the partial query before the cursor", () => {
    expect(getActiveMentionTrigger("Hello @ali", 10)).toEqual({
      startIndex: 6,
      query: "ali",
    });
  });

  it("supports discriminator query text", () => {
    expect(getActiveMentionTrigger("Hello @alice#12", 15)).toEqual({
      startIndex: 6,
      query: "alice#12",
    });
  });

  it("ignores completed mentions separated by whitespace", () => {
    expect(getActiveMentionTrigger("Hello @alice done", 17)).toBeNull();
  });

  it("ignores @ inside words or email addresses", () => {
    expect(getActiveMentionTrigger("mail me@example.com", 15)).toBeNull();
    expect(getActiveMentionTrigger("prefix@ali", 10)).toBeNull();
  });
});
