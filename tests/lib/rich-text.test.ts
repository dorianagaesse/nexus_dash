import { describe, expect, test } from "vitest";

import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";

describe("rich-text", () => {
  test("sanitizes allowed content and strips unsafe tags", () => {
    const input =
      '<p>Hello <strong>world</strong><script>alert(1)</script> <a href="https://example.com">link</a></p>';
    const sanitized = sanitizeRichText(input);

    expect(sanitized).toContain("<p>");
    expect(sanitized).toContain("<strong>world</strong>");
    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).not.toContain("<script>");
  });

  test("returns null when sanitized content has no text", () => {
    expect(sanitizeRichText("   ")).toBeNull();
    expect(sanitizeRichText("<p><br/></p>")).toBeNull();
  });

  test("converts rich html to plain text", () => {
    const input = "<h1>Hello</h1><p>there   team</p>";
    expect(richTextToPlainText(input)).toBe("Hellothere team");
  });
});
