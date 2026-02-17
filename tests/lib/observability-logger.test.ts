import { beforeEach, describe, expect, test, vi } from "vitest";

import { logServerWarning } from "@/lib/observability/logger";

describe("observability logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("serializes Error instances passed inside metadata", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logServerWarning("test.scope", "warning", {
      error: new Error("invalid-form"),
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0])) as {
      metadata: {
        error: {
          errorName: string;
          errorMessage: string;
        };
      };
    };

    expect(payload.metadata.error.errorName).toBe("Error");
    expect(payload.metadata.error.errorMessage).toBe("invalid-form");
  });

  test("handles circular metadata safely", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;

    expect(() => {
      logServerWarning("test.scope", "warning", metadata);
    }).not.toThrow();

    const payload = JSON.parse(String(warnSpy.mock.calls[0][0])) as {
      metadata: {
        self: string;
      };
    };

    expect(payload.metadata.self).toBe("[Circular]");
  });
});
