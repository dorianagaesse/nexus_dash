import { describe, expect, test } from "vitest";

import {
  buildEmojiCatalog,
  buildNextRecentEmojis,
  findEmojiMatches,
  getEmojiAssetUrl,
  getPopularEmojiEntries,
  normalizeRecentEmojis,
} from "@/lib/emoji";
import { insertTextIntoValue } from "@/lib/emoji-input";

describe("emoji-input", () => {
  test("inserts text at the current cursor position", () => {
    expect(insertTextIntoValue("Ship it", "\u{1F680}", 4, 4)).toEqual({
      nextValue: "Ship\u{1F680} it",
      nextCursorPosition: 6,
    });
  });

  test("replaces the current selection when inserting text", () => {
    expect(insertTextIntoValue("Review soon", "\u2705", 0, 6)).toEqual({
      nextValue: "\u2705 soon",
      nextCursorPosition: 1,
    });
  });

  test("falls back to appending when selection is unavailable", () => {
    expect(insertTextIntoValue("Ready", "\u2728", null, null)).toEqual({
      nextValue: "Ready\u2728",
      nextCursorPosition: 6,
    });
  });
});

describe("emoji recents", () => {
  test("moves the newest emoji to the front without duplicates", () => {
    expect(
      buildNextRecentEmojis(["\u2705", "\u{1F680}", "\u{1F389}"], "\u{1F680}")
    ).toEqual(["\u{1F680}", "\u2705", "\u{1F389}"]);
  });

  test("caps recent emoji history", () => {
    const previous = [
      "\u{1F600}",
      "\u{1F642}",
      "\u{1F60A}",
      "\u{1F602}",
      "\u{1F972}",
      "\u{1F609}",
      "\u{1F914}",
      "\u{1FAE1}",
      "\u{1F60E}",
      "\u{1F973}",
      "\u{1F680}",
      "\u2728",
    ];

    expect(buildNextRecentEmojis(previous, "\u{1F44D}")).toEqual([
      "\u{1F44D}",
      "\u{1F600}",
      "\u{1F642}",
      "\u{1F60A}",
      "\u{1F602}",
      "\u{1F972}",
      "\u{1F609}",
      "\u{1F914}",
      "\u{1FAE1}",
      "\u{1F60E}",
      "\u{1F973}",
      "\u{1F680}",
    ]);
  });

  test("normalizes stored recents by filtering, deduping, and capping", () => {
    expect(
      normalizeRecentEmojis([
        "\u{1F600}",
        42,
        "\u{1F600}",
        "\u{1F680}",
        null,
        "\u{1F389}",
        "\u{1F4DD}",
        "\u2705",
        "\u{1F525}",
        "\u{1F4A1}",
        "\u{1F4C6}",
        "\u{1F91D}",
        "\u{1F331}",
        "\u2B50",
        "\u2615",
      ])
    ).toEqual([
      "\u{1F600}",
      "\u{1F680}",
      "\u{1F389}",
      "\u{1F4DD}",
      "\u2705",
      "\u{1F525}",
      "\u{1F4A1}",
      "\u{1F4C6}",
      "\u{1F91D}",
      "\u{1F331}",
      "\u2B50",
      "\u2615",
    ]);
  });
});

describe("emoji catalog", () => {
  test("builds entries with github-style shortcodes and excludes component groups", () => {
    const catalog = buildEmojiCatalog(
      [
        {
          emoji: "\u{1F600}",
          hexcode: "1F600",
          label: "grinning face",
          tags: ["happy", "smile"],
          order: 1,
          group: 0,
        },
        {
          emoji: "\u{1F44D}",
          hexcode: "1F44D",
          label: "thumbs up",
          tags: ["approve"],
          order: 2,
          group: 1,
        },
        {
          emoji: "\u{1F3FB}",
          hexcode: "1F3FB",
          label: "light skin tone",
          order: 3,
          group: 2,
        },
      ],
      {
        groups: [
          { key: "smileys-emotion", message: "smileys & emotion", order: 0 },
          { key: "people-body", message: "people & body", order: 1 },
          { key: "component", message: "components", order: 2 },
        ],
      },
      {
        "1F600": "grinning",
        "1F44D": ["+1", "thumbsup"],
      }
    );

    expect(catalog.entries).toHaveLength(2);
    expect(catalog.groups.map((group) => group.id)).toEqual(["smileys-emotion", "people-body"]);
    expect(catalog.entries[0]).toMatchObject({
      emoji: "\u{1F600}",
      shortcode: "grinning",
      hoverLabel: ":grinning:",
      groupLabel: "Smileys & Emotion",
    });
    expect(catalog.entries[1]).toMatchObject({
      emoji: "\u{1F44D}",
      shortcode: "+1",
      hoverLabel: ":+1:",
      groupLabel: "People & Body",
    });
  });

  test("finds emoji matches by shortcode and label", () => {
    const catalog = buildEmojiCatalog(
      [
        {
          emoji: "\u{1F680}",
          hexcode: "1F680",
          label: "rocket",
          tags: ["ship", "launch"],
          order: 1,
          group: 7,
        },
        {
          emoji: "\u{1F4DD}",
          hexcode: "1F4DD",
          label: "memo",
          tags: ["notes", "write"],
          order: 2,
          group: 7,
        },
      ],
      {
        groups: [
          { key: "smileys-emotion", message: "smileys & emotion", order: 0 },
          { key: "people-body", message: "people & body", order: 1 },
          { key: "component", message: "components", order: 2 },
          { key: "animals-nature", message: "animals & nature", order: 3 },
          { key: "food-drink", message: "food & drink", order: 4 },
          { key: "travel-places", message: "travel & places", order: 5 },
          { key: "activities", message: "activities", order: 6 },
          { key: "objects", message: "objects", order: 7 },
        ],
      },
      {
        "1F680": "rocket",
        "1F4DD": "memo",
      }
    );

    expect(findEmojiMatches(catalog.entries, ":rocket:").map((entry) => entry.emoji)).toEqual([
      "\u{1F680}",
    ]);
    expect(findEmojiMatches(catalog.entries, "note").map((entry) => entry.emoji)).toEqual([
      "\u{1F4DD}",
    ]);
  });

  test("returns popular entries in a stable curated order", () => {
    const catalog = buildEmojiCatalog(
      [
        {
          emoji: "\u{1F600}",
          hexcode: "1F600",
          label: "grinning face",
          order: 1,
          group: 0,
        },
        {
          emoji: "\u{1F44D}",
          hexcode: "1F44D",
          label: "thumbs up",
          order: 2,
          group: 1,
        },
        {
          emoji: "\u2728",
          hexcode: "2728",
          label: "sparkles",
          order: 3,
          group: 7,
        },
      ],
      {
        groups: [
          { key: "smileys-emotion", message: "smileys & emotion", order: 0 },
          { key: "people-body", message: "people & body", order: 1 },
          { key: "component", message: "components", order: 2 },
          { key: "animals-nature", message: "animals & nature", order: 3 },
          { key: "food-drink", message: "food & drink", order: 4 },
          { key: "travel-places", message: "travel & places", order: 5 },
          { key: "activities", message: "activities", order: 6 },
          { key: "objects", message: "objects", order: 7 },
        ],
      },
      {
        "1F600": "grinning",
        "1F44D": ["thumbsup", "+1"],
        "2728": "sparkles",
      }
    );

    expect(getPopularEmojiEntries(catalog).map((entry) => entry.shortcode)).toEqual([
      "grinning",
      "thumbsup",
      "sparkles",
    ]);
  });

  test("builds a twemoji asset url from hexcode", () => {
    expect(getEmojiAssetUrl({ hexcode: "1F44D-1F3FB" })).toBe(
      "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/1f44d-1f3fb.svg"
    );
  });
});
