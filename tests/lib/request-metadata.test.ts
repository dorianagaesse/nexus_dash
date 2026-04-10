import { describe, expect, test } from "vitest";

import { readClientIpAddressFromHeaders } from "@/lib/http/request-metadata";

describe("request-metadata", () => {
  test("returns null when x-real-ip is blank after trimming", () => {
    const headers = new Headers([["x-real-ip", "   "]]);

    expect(readClientIpAddressFromHeaders(headers)).toBeNull();
  });

  test("prefers the first non-empty forwarded-for entry", () => {
    const headers = new Headers([["x-forwarded-for", " 198.51.100.1, 203.0.113.5 "]]);

    expect(readClientIpAddressFromHeaders(headers)).toBe("198.51.100.1");
  });
});
