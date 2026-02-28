import { describe, expect, test } from "vitest";

import { validateAttachmentFiles } from "@/lib/services/attachment-input-service";

describe("attachment-input-service", () => {
  test("accepts file when mime type is inferred from filename extension", () => {
    const file = new File(["binary"], "iphone-photo.HEIC", { type: "" });

    expect(validateAttachmentFiles([file])).toBeNull();
  });

  test("rejects unsupported file extensions when mime type is missing", () => {
    const file = new File(["binary"], "archive.zip", { type: "" });

    expect(validateAttachmentFiles([file])).toBe("attachment-file-type-invalid");
  });
});
