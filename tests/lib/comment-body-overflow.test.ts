// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { measureCommentBodyOverflow } from "@/lib/comment-body-overflow";

function createElementWithScrollHeight(scrollHeight: number): HTMLElement {
  const element = document.createElement("p");
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  return element;
}

describe("measureCommentBodyOverflow", () => {
  test("reports false for content at or under the collapsed cap", () => {
    // jsdom default root font size is 16px, so the cap is 16 * 7.5 = 120px.
    expect(measureCommentBodyOverflow(createElementWithScrollHeight(0))).toBe(
      false
    );
    expect(measureCommentBodyOverflow(createElementWithScrollHeight(120))).toBe(
      false
    );
  });

  test("reports true for content taller than the collapsed cap", () => {
    expect(measureCommentBodyOverflow(createElementWithScrollHeight(121))).toBe(
      true
    );
    expect(
      measureCommentBodyOverflow(createElementWithScrollHeight(1000))
    ).toBe(true);
  });
});
