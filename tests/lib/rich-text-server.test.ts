import { describe, expect, test } from "vitest";

import { coerceRichTextHtml } from "@/lib/rich-text";

describe("rich-text in the Node server runtime (no DOM)", () => {
  test("runs without a document, like the service layer does", () => {
    expect(typeof document).toBe("undefined");
  });

  test("wraps bare root-level text runs in paragraphs", () => {
    expect(
      coerceRichTextHtml("Follow up:<ul><li>Confirm rollout order</li></ul>")
    ).toBe("<p>Follow up:</p><ul><li>Confirm rollout order</li></ul>");
    expect(coerceRichTextHtml("<ul><li>Item</li></ul>Wrap-up note.")).toBe(
      "<ul><li>Item</li></ul><p>Wrap-up note.</p>"
    );
  });

  test("keeps canonical blocks and whitespace-only root nodes untouched", () => {
    const canonical = "<p>First</p>\n\n<ul><li>Item</li></ul>";
    expect(coerceRichTextHtml(canonical)).toBe(canonical);
  });

  test("wraps bare text around inline root-level markup", () => {
    expect(coerceRichTextHtml("Intro <strong>bold</strong> outro")).toBe(
      "<p>Intro</p><strong>bold</strong><p>outro</p>"
    );
  });
});
