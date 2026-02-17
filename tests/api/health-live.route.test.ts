import { describe, expect, test } from "vitest";

import { GET } from "@/app/api/health/live/route";

describe("GET /api/health/live", () => {
  test("returns liveness metadata", async () => {
    const response = await GET(
      new Request("http://localhost/api/health/live", {
        headers: {
          "x-request-id": "req-live-1",
        },
      })
    );
    const payload = (await response.json()) as {
      status: string;
      service: string;
      timestamp: string;
      uptimeSeconds: number;
      requestId: string | null;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("nexusdash");
    expect(typeof payload.timestamp).toBe("string");
    expect(typeof payload.uptimeSeconds).toBe("number");
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(payload.requestId).toBe("req-live-1");
  });
});
