import { describe, expect, test } from "vitest";

import {
  coerceRichTextHtml,
  richTextToPlainText,
  sanitizeRichText,
} from "@/lib/rich-text";

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

  test("coerces plain text into paragraph html", () => {
    expect(coerceRichTextHtml("Hello\nteam")).toBe("<p>Hello<br />team</p>");
    expect(coerceRichTextHtml("Line one\n\nLine two")).toBe(
      "<p>Line one</p><p>Line two</p>"
    );
  });

  test("coerces html input through the sanitizer", () => {
    expect(coerceRichTextHtml("<p>Hello<script>alert(1)</script></p>")).toBe(
      "<p>Hello</p>"
    );
  });

  test("treats unsupported angle-bracket text as plain text", () => {
    expect(coerceRichTextHtml("Token <abc123> should stay visible")).toBe(
      "<p>Token &lt;abc123&gt; should stay visible</p>"
    );
  });

  test("converts rich html to plain text", () => {
    const input = "<h1>Hello</h1><p>there   team</p>";
    expect(richTextToPlainText(input)).toBe("Hellothere team");
  });
});
