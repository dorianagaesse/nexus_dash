import { describe, expect, test } from "vitest";

import { buildNextRecentEmojis, normalizeRecentEmojis } from "@/lib/emoji";
import { insertTextIntoValue } from "@/lib/emoji-input";

describe("emoji-input", () => {
  test("inserts text at the current cursor position", () => {
    expect(insertTextIntoValue("Ship it", "🚀", 4, 4)).toEqual({
      nextValue: "Ship🚀 it",
      nextCursorPosition: 6,
    });
  });

  test("replaces the current selection when inserting text", () => {
    expect(insertTextIntoValue("Review soon", "✅", 0, 6)).toEqual({
      nextValue: "✅ soon",
      nextCursorPosition: 1,
    });
  });

  test("falls back to appending when selection is unavailable", () => {
    expect(insertTextIntoValue("Ready", "✨", null, null)).toEqual({
      nextValue: "Ready✨",
      nextCursorPosition: 6,
    });
  });
});

describe("emoji recents", () => {
  test("moves the newest emoji to the front without duplicates", () => {
    expect(buildNextRecentEmojis(["✅", "🚀", "🎉"], "🚀")).toEqual(["🚀", "✅", "🎉"]);
  });

  test("caps recent emoji history", () => {
    const previous = ["😀", "🙂", "😊", "😂", "🥲", "😉", "🤔", "🫡", "😎", "🥳", "🚀", "✨"];
    expect(buildNextRecentEmojis(previous, "👍")).toEqual([
      "👍",
      "😀",
      "🙂",
      "😊",
      "😂",
      "🥲",
      "😉",
      "🤔",
      "🫡",
      "😎",
      "🥳",
      "🚀",
    ]);
  });

  test("normalizes stored recents by filtering, deduping, and capping", () => {
    expect(
      normalizeRecentEmojis([
        "😀",
        42,
        "😀",
        "🚀",
        null,
        "🎉",
        "📝",
        "✅",
        "🔥",
        "💡",
        "📅",
        "🤝",
        "🌱",
        "⭐",
        "☕",
      ])
    ).toEqual(["😀", "🚀", "🎉", "📝", "✅", "🔥", "💡", "📅", "🤝", "🌱", "⭐", "☕"]);
  });
});
