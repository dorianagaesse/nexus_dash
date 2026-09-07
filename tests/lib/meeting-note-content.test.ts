import { describe, expect, test } from "vitest";

import {
  meetingNoteInputPreviewText,
  meetingNoteSectionsSearchText,
} from "@/lib/meeting-note-content";

describe("meeting-note-content", () => {
  describe("meetingNoteSectionsSearchText", () => {
    test("indexes canonical rich-text HTML sections as plain text", () => {
      const haystack = meetingNoteSectionsSearchText(
        "<p>Review <strong>roadmap</strong> risks.</p><ul><li>Alpha</li><li>Beta</li></ul>",
        "<p>Scope was clarified.</p>"
      );

      expect(haystack).toContain("Review roadmap risks.");
      expect(haystack).toContain("Alpha");
      expect(haystack).toContain("Beta");
      expect(haystack).toContain("Scope was clarified.");
    });

    test("reads legacy plain-text sections identically to canonical HTML", () => {
      const legacy = meetingNoteSectionsSearchText(
        "Line one.\n\nLine two.",
        "Output here."
      );
      const canonical = meetingNoteSectionsSearchText(
        "<p>Line one.</p><p>Line two.</p>",
        "<p>Output here.</p>"
      );

      expect(legacy).toBe("Line one. Line two. Output here.");
      expect(canonical).toBe(legacy);
    });

    test("keeps token and code block values searchable", () => {
      const haystack = meetingNoteSectionsSearchText(
        "",
        '<div data-rich-block="token"><p>API key</p><code>sk-live-123</code></div>'
      );

      expect(haystack).toContain("API key: sk-live-123");
    });

    test("returns an empty string when both sections are empty", () => {
      expect(meetingNoteSectionsSearchText("", "")).toBe("");
    });
  });

  describe("meetingNoteInputPreviewText", () => {
    test("joins canonical paragraphs and lists into bullet-separated preview text", () => {
      expect(
        meetingNoteInputPreviewText(
          "<p>Agenda</p><p>Risks</p><ul><li>Alpha</li><li>Beta</li></ul>"
        )
      ).toBe("Agenda • Risks • Alpha • Beta");
    });

    test("reads legacy multi-paragraph plain text without tag leakage", () => {
      expect(meetingNoteInputPreviewText("Line one.\n\nLine two.")).toBe(
        "Line one. • Line two."
      );
    });

    test("labels code blocks and hides token values", () => {
      expect(
        meetingNoteInputPreviewText(
          '<pre data-rich-block="code"><code>npm test</code></pre>'
        )
      ).toBe("Code: npm test");
      expect(
        meetingNoteInputPreviewText(
          '<div data-rich-block="token"><p>API key</p><code>sk-live-123</code></div>'
        )
      ).toBe("API key: hidden value");
    });

    test("returns an empty string when inputs are empty", () => {
      expect(meetingNoteInputPreviewText("")).toBe("");
    });
  });
});
