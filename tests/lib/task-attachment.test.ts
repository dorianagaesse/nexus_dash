import { describe, expect, test } from "vitest";

import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  buildAttachmentInlineUrl,
  formatAttachmentFileSize,
  getAttachmentPreviewKind,
  isAllowedAttachmentMimeType,
  isAttachmentKind,
  isAttachmentPreviewable,
  normalizeAttachmentUrl,
} from "@/lib/task-attachment";

describe("task-attachment", () => {
  test("validates attachment kinds", () => {
    expect(isAttachmentKind(ATTACHMENT_KIND_LINK)).toBe(true);
    expect(isAttachmentKind(ATTACHMENT_KIND_FILE)).toBe(true);
    expect(isAttachmentKind("unknown")).toBe(false);
  });

  test("validates allowed mime types", () => {
    expect(isAllowedAttachmentMimeType("application/pdf")).toBe(true);
    expect(isAllowedAttachmentMimeType("application/zip")).toBe(false);
  });

  test("normalizes urls and rejects invalid protocols", () => {
    expect(normalizeAttachmentUrl("example.com/doc")).toBe("https://example.com/doc");
    expect(normalizeAttachmentUrl(" https://example.com/a?b=1 ")).toBe(
      "https://example.com/a?b=1"
    );
    expect(normalizeAttachmentUrl("")).toBeNull();
    expect(normalizeAttachmentUrl("ftp://example.com")).toBeNull();
  });

  test("formats file size values", () => {
    expect(formatAttachmentFileSize(null)).toBe("");
    expect(formatAttachmentFileSize(-1)).toBe("");
    expect(formatAttachmentFileSize(512)).toBe("512 B");
    expect(formatAttachmentFileSize(1024)).toBe("1.0 KB");
    expect(formatAttachmentFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  test("identifies previewable types", () => {
    expect(getAttachmentPreviewKind("application/pdf")).toBe("pdf");
    expect(getAttachmentPreviewKind("image/png")).toBe("image");
    expect(getAttachmentPreviewKind("text/plain")).toBeNull();

    expect(isAttachmentPreviewable(ATTACHMENT_KIND_FILE, "image/png")).toBe(true);
    expect(isAttachmentPreviewable(ATTACHMENT_KIND_LINK, "image/png")).toBe(false);
    expect(isAttachmentPreviewable(ATTACHMENT_KIND_FILE, null)).toBe(false);
  });

  test("builds inline url query safely", () => {
    expect(buildAttachmentInlineUrl(null)).toBeNull();
    expect(buildAttachmentInlineUrl("/api/download/file")).toBe(
      "/api/download/file?disposition=inline"
    );
    expect(buildAttachmentInlineUrl("/api/download/file?token=1")).toBe(
      "/api/download/file?token=1&disposition=inline"
    );
  });
});
