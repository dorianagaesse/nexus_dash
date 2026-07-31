import { describe, expect, test } from "vitest";

import { formatTaskReference } from "@/lib/task-reference";

describe("formatTaskReference", () => {
  test("formats a stable user-facing task reference", () => {
    expect(formatTaskReference(1)).toBe("ND-1");
    expect(formatTaskReference(4821)).toBe("ND-4821");
  });

  test("allows missing values at compatibility boundaries", () => {
    expect(formatTaskReference(undefined)).toBeUndefined();
    expect(formatTaskReference(null)).toBeUndefined();
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid reference number %s",
    (referenceNumber) => {
      expect(() => formatTaskReference(referenceNumber)).toThrow(
        "task-reference-number-invalid"
      );
    }
  );
});
