import { gunzipSync } from "node:zlib";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  checkAbuseMock,
  registerAbuseFailureMock,
  beginPairingMock,
  pollPairingMock,
  requireAuthUserMock,
  inspectPairingMock,
  respondPairingMock,
} = vi.hoisted(() => ({
  checkAbuseMock: vi.fn(),
  registerAbuseFailureMock: vi.fn(),
  beginPairingMock: vi.fn(),
  pollPairingMock: vi.fn(),
  requireAuthUserMock: vi.fn(),
  inspectPairingMock: vi.fn(),
  respondPairingMock: vi.fn(),
}));

vi.mock("@/lib/services/auth-abuse-control-service", () => ({
  AuthRateLimitScope: { agent_token_exchange: "agent_token_exchange" },
  buildAuthRateLimitKey: (_prefix: string, ip: string) => `cli:${ip}`,
  checkAuthAbuseControls: checkAbuseMock,
  registerAuthAbuseFailure: registerAbuseFailureMock,
}));

vi.mock("@/lib/services/agent-cli-pairing-service", () => ({
  beginAgentCliPairing: beginPairingMock,
  pollAgentCliPairing: pollPairingMock,
  inspectAgentCliPairingForUser: inspectPairingMock,
  respondToAgentCliPairing: respondPairingMock,
}));

vi.mock("@/lib/auth/api-guard", () => ({
  readClientIpAddress: () => "127.0.0.1",
  requireAuthenticatedApiUser: requireAuthUserMock,
}));

import { POST as postCli } from "@/app/api/auth/agent/cli/route";
import {
  GET as getApprove,
  POST as postApprove,
} from "@/app/api/auth/agent/cli/approve/route";
import { GET as getCliTarball } from "@/app/api/cli/nd.tgz/route";

describe("CLI pairing and tarball API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkAbuseMock.mockResolvedValue({ ok: true });
    requireAuthUserMock.mockResolvedValue({ ok: true, userId: "owner-1" });
  });

  test("POST /api/auth/agent/cli enforces abuse limits and routes begin/poll", async () => {
    checkAbuseMock.mockResolvedValueOnce({ ok: false });
    const limited = await postCli(
      new NextRequest("http://localhost:3000/api/auth/agent/cli", {
        method: "POST",
        body: JSON.stringify({ operation: "begin" }),
      })
    );
    expect(limited.status).toBe(429);

    const invalidOp = await postCli(
      new NextRequest("http://localhost:3000/api/auth/agent/cli", {
        method: "POST",
        body: JSON.stringify({ operation: "unknown" }),
      })
    );
    expect(invalidOp.status).toBe(400);
    expect(registerAbuseFailureMock).toHaveBeenCalledTimes(1);

    beginPairingMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: { requestId: "req-1", userCode: "ABCD-EFGH" },
    });
    const begun = await postCli(
      new NextRequest("http://localhost:3000/api/auth/agent/cli", {
        method: "POST",
        body: JSON.stringify({ operation: "begin" }),
      })
    );
    expect(begun.status).toBe(201);
    expect(await begun.json()).toEqual({
      requestId: "req-1",
      userCode: "ABCD-EFGH",
    });
  });

  test("GET and POST /api/auth/agent/cli/approve require human session and same-origin headers", async () => {
    inspectPairingMock.mockResolvedValueOnce({
      state: "ready",
      userCode: "ABCD-EFGH",
      request: null,
      approvedGrant: null,
      ownedProjects: [],
    });
    const inspected = await getApprove(
      new NextRequest(
        "http://localhost:3000/api/auth/agent/cli/approve?code=ABCD-EFGH"
      )
    );
    expect(inspected.status).toBe(200);

    const crossSite = await postApprove(
      new NextRequest("http://localhost:3000/api/auth/agent/cli/approve", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ code: "ABCD-EFGH", decision: "approve" }),
      })
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "invalid-origin" });

    respondPairingMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { decision: "denied" },
    });
    const sameOrigin = await postApprove(
      new NextRequest("http://localhost:3000/api/auth/agent/cli/approve", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ code: "ABCD-EFGH", decision: "deny" }),
      })
    );
    expect(sameOrigin.status).toBe(200);
    expect(await sameOrigin.json()).toEqual({ decision: "denied" });
  });

  test("GET /api/cli/nd.tgz serves a valid gzipped tar package with bin/nd.mjs", async () => {
    const response = await getCliTarball();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    const archive = gunzipSync(Buffer.from(await response.arrayBuffer())).toString(
      "utf8"
    );
    expect(archive).toContain("package/package.json");
    expect(archive).toContain('"@nexusdash/nd-cli"');
    expect(archive).toContain("package/bin/nd.mjs");
    expect(archive).toContain("package/src/cli.mjs");
  });
});
