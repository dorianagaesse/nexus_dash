import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  getAgentTokenRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server"
  );

  return {
    ...actual,
    getAgentTokenRuntimeConfig: envMock.getAgentTokenRuntimeConfig,
  };
});

import {
  issueAgentAccessToken,
  verifyAgentAccessToken,
} from "@/lib/auth/agent-token-service";

function rewritePayload(token: string, change: (payload: Record<string, unknown>) => void) {
  const [header, encoded] = token.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  change(payload);
  const unsigned = `${header}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  const signature = crypto.createHmac("sha256", "0123456789abcdef0123456789abcdef")
    .update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

describe("agent-token-service", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetAllMocks();
    envMock.getAgentTokenRuntimeConfig.mockReturnValue({
      signingSecret: "0123456789abcdef0123456789abcdef",
      ttlSeconds: 600,
    });
  });

  test("issues and verifies an access token round trip", () => {
    const issuedToken = issueAgentAccessToken({
      credentialId: "credential-1",
      credentialPublicId: "nda_generation1",
      projectId: "project-1",
      ownerUserId: "owner-1",
      scopes: ["roadmap:read", "roadmap:write", "task:read", "task:write"],
    });

    const verifiedToken = verifyAgentAccessToken(issuedToken.accessToken);

    expect(verifiedToken.ok).toBe(true);
    if (!verifiedToken.ok) {
      return;
    }

    expect(verifiedToken.data.credentialId).toBe("credential-1");
    expect(verifiedToken.data.credentialPublicId).toBe("nda_generation1");
    expect(verifiedToken.data.projectId).toBe("project-1");
    expect(verifiedToken.data.ownerUserId).toBe("owner-1");
    expect(verifiedToken.data.scopes).toEqual([
      "task:read",
      "task:write",
      "roadmap:read",
      "roadmap:write",
    ]);
    expect(verifiedToken.data.tokenId).toBe(issuedToken.tokenId);
    expect(Math.floor(verifiedToken.data.expiresAt.getTime() / 1000)).toBe(
      Math.floor(issuedToken.expiresAt.getTime() / 1000)
    );
  });

  test.each([0, 1, 500, 999])("preserves the key generation at millisecond %i", (milliseconds) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 8, 12, 0, 0, milliseconds)));
    const issued = issueAgentAccessToken({
      credentialId: "credential-1", credentialPublicId: "nda_rotated",
      projectId: "project-1", ownerUserId: "owner-1", scopes: ["task:read"],
    });
    expect(verifyAgentAccessToken(issued.accessToken)).toMatchObject({
      ok: true, data: { credentialPublicId: "nda_rotated" },
    });
  });

  test.each([null, "", "  ", 123, {}, []])("rejects malformed generation claim %j", (claim) => {
    const issued = issueAgentAccessToken({
      credentialId: "credential-1", credentialPublicId: "nda_generation1",
      projectId: "project-1", ownerUserId: "owner-1", scopes: ["task:read"],
    });
    const token = rewritePayload(issued.accessToken, (payload) => { payload.credentialPublicId = claim; });
    expect(verifyAgentAccessToken(token)).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  test("leaves legacy generation absent for the fail-closed credential check", () => {
    const issued = issueAgentAccessToken({
      credentialId: "credential-1", credentialPublicId: "nda_generation1",
      projectId: "project-1", ownerUserId: "owner-1", scopes: ["task:read"],
    });
    const token = rewritePayload(issued.accessToken, (payload) => { delete payload.credentialPublicId; });
    const verified = verifyAgentAccessToken(token);
    expect(verified).toMatchObject({ ok: true, data: { credentialPublicId: undefined } });
  });

  test("does not allow replacing the signed generation claim", () => {
    const issued = issueAgentAccessToken({
      credentialId: "credential-1", credentialPublicId: "nda_generation1",
      projectId: "project-1", ownerUserId: "owner-1", scopes: ["task:read"],
    });
    const [header, encoded, signature] = issued.accessToken.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.credentialPublicId = "nda_generation2";
    const token = `${header}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
    expect(verifyAgentAccessToken(token)).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  test("rejects tokens with a tampered signature", () => {
    const issuedToken = issueAgentAccessToken({
      credentialId: "credential-1",
      credentialPublicId: "nda_generation1",
      projectId: "project-1",
      ownerUserId: "owner-1",
      scopes: ["task:read"],
    });

    const [headerSegment, payloadSegment] = issuedToken.accessToken.split(".");
    const tamperedToken = `${headerSegment}.${payloadSegment}.invalid-signature`;

    expect(verifyAgentAccessToken(tamperedToken)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("rejects expired tokens", () => {
    envMock.getAgentTokenRuntimeConfig.mockReturnValue({
      signingSecret: "0123456789abcdef0123456789abcdef",
      ttlSeconds: -60,
    });

    const issuedToken = issueAgentAccessToken({
      credentialId: "credential-1",
      credentialPublicId: "nda_generation1",
      projectId: "project-1",
      ownerUserId: "owner-1",
      scopes: ["task:read"],
    });

    expect(verifyAgentAccessToken(issuedToken.accessToken)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("rejects tokens with invalid scope payloads", () => {
    const issuedToken = issueAgentAccessToken({
      credentialId: "credential-1",
      credentialPublicId: "nda_generation1",
      projectId: "project-1",
      ownerUserId: "owner-1",
      scopes: ["task:read"],
    });
    const [headerSegment, payloadSegment, signatureSegment] =
      issuedToken.accessToken.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    payload.scopes = ["task:read", "not-a-scope"];

    const tamperedToken = [
      headerSegment,
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
      signatureSegment,
    ].join(".");

    expect(verifyAgentAccessToken(tamperedToken)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("returns a configuration error when signing config cannot be read", () => {
    envMock.getAgentTokenRuntimeConfig.mockImplementation(() => {
      throw new Error("missing-config");
    });

    expect(verifyAgentAccessToken("header.payload.signature")).toEqual({
      ok: false,
      status: 500,
      error: "agent-auth-config-invalid",
    });
  });
});
