import { describe, expect, test } from "vitest";

import {
  CONTEXT_CARD_COLORS,
  getContextCardColorFromSeed,
  isContextCardColor,
} from "@/lib/context-card-colors";

describe("context-card-colors", () => {
  test("recognizes known palette values", () => {
    expect(isContextCardColor(CONTEXT_CARD_COLORS[0])).toBe(true);
    expect(isContextCardColor("#ffffff")).toBe(false);
  });

  test("returns deterministic color from seed", () => {
    const first = getContextCardColorFromSeed("alpha-seed");
    const second = getContextCardColorFromSeed("alpha-seed");

    expect(first).toBe(second);
    expect(CONTEXT_CARD_COLORS).toContain(first);
  });
});
