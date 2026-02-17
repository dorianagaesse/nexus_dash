import { beforeEach, describe, expect, test, vi } from "vitest";

const healthServiceMock = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
}));

vi.mock("@/lib/services/health-service", () => ({
  checkDatabaseReadiness: healthServiceMock.checkDatabaseReadiness,
}));

import { GET } from "@/app/api/health/ready/route";

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns ready when database ping succeeds", async () => {
    healthServiceMock.checkDatabaseReadiness.mockResolvedValueOnce(undefined);

    const response = await GET(
      new Request("http://localhost/api/health/ready", {
        headers: {
          "x-request-id": "req-ready-1",
        },
      })
    );
    const payload = (await response.json()) as {
      status: string;
      checks: { database: string };
      service: string;
      timestamp: string;
      requestId: string | null;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("ready");
    expect(payload.checks.database).toBe("ok");
    expect(payload.service).toBe("nexusdash");
    expect(typeof payload.timestamp).toBe("string");
    expect(payload.requestId).toBe("req-ready-1");
  });

  test("returns degraded when database ping fails", async () => {
    healthServiceMock.checkDatabaseReadiness.mockRejectedValueOnce(
      new Error("db-down")
    );

    const response = await GET(
      new Request("http://localhost/api/health/ready", {
        headers: {
          "x-request-id": "req-ready-2",
        },
      })
    );
    const payload = (await response.json()) as {
      status: string;
      checks: { database: string };
      error: string;
      requestId: string | null;
    };

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("degraded");
    expect(payload.checks.database).toBe("error");
    expect(payload.error).toBe("database-unreachable");
    expect(payload.requestId).toBe("req-ready-2");
  });
});

