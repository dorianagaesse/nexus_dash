import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { proxy } from "@/proxy";

function createApiRequest(requestId?: string): NextRequest {
  return new NextRequest("http://localhost/api/health/live", {
    headers: requestId ? { "x-request-id": requestId } : {},
  });
}

describe("api middleware request id", () => {
  test("preserves a valid incoming request id", () => {
    const request = createApiRequest("req_123.valid-id");

    const response = proxy(request);

    expect(response.headers.get("x-request-id")).toBe("req_123.valid-id");
  });

  test("replaces invalid incoming request id with generated uuid", () => {
    const request = createApiRequest("bad id with spaces");

    const response = proxy(request);
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(requestId).not.toBe("bad id with spaces");
  });

  test("replaces oversized incoming request id with generated uuid", () => {
    const request = createApiRequest("a".repeat(129));

    const response = proxy(request);
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
