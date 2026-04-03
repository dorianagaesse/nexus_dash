import crypto from "node:crypto";

import { parseAgentScopes, type AgentScope } from "@/lib/agent-access";
import { getAgentTokenRuntimeConfig } from "@/lib/env.server";

const AGENT_TOKEN_ISSUER = "nexusdash-agent";
const AGENT_TOKEN_AUDIENCE = "nexusdash-api";

interface AgentAccessTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  projectId: string;
  ownerUserId: string;
  scopes: AgentScope[];
}

export interface IssuedAgentAccessToken {
  accessToken: string;
  tokenId: string;
  issuedAt: Date;
  expiresAt: Date;
  expiresInSeconds: number;
}

interface VerifiedAgentAccessTokenSuccess {
  ok: true;
  data: {
    credentialId: string;
    projectId: string;
    ownerUserId: string;
    scopes: AgentScope[];
    tokenId: string;
    issuedAt: Date;
    expiresAt: Date;
  };
}

interface VerifiedAgentAccessTokenFailure {
  ok: false;
  status: number;
  error: string;
}

export type VerifiedAgentAccessTokenResult =
  | VerifiedAgentAccessTokenSuccess
  | VerifiedAgentAccessTokenFailure;

function encodeJsonSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJsonSegment(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function signUnsignedToken(unsignedToken: string, signingSecret: string): Buffer {
  return crypto.createHmac("sha256", signingSecret).update(unsignedToken).digest();
}

function isValidPayload(value: unknown): value is AgentAccessTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AgentAccessTokenPayload>;
  if (
    payload.iss !== AGENT_TOKEN_ISSUER ||
    payload.aud !== AGENT_TOKEN_AUDIENCE ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.projectId !== "string" ||
    typeof payload.ownerUserId !== "string"
  ) {
    return false;
  }

  if (!Array.isArray(payload.scopes)) {
    return false;
  }

  const scopes = parseAgentScopes(payload.scopes);
  return scopes.length > 0 && scopes.length === payload.scopes.length;
}

export function issueAgentAccessToken(input: {
  credentialId: string;
  projectId: string;
  ownerUserId: string;
  scopes: AgentScope[];
}): IssuedAgentAccessToken {
  const runtimeConfig = getAgentTokenRuntimeConfig();
  const tokenId = crypto.randomBytes(18).toString("base64url");
  const issuedAt = new Date();
  const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
  const expiresAt = new Date(
    issuedAt.getTime() + runtimeConfig.ttlSeconds * 1000
  );

  const payload: AgentAccessTokenPayload = {
    iss: AGENT_TOKEN_ISSUER,
    aud: AGENT_TOKEN_AUDIENCE,
    sub: input.credentialId,
    jti: tokenId,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + runtimeConfig.ttlSeconds,
    projectId: input.projectId,
    ownerUserId: input.ownerUserId,
    scopes: input.scopes,
  };

  const headerSegment = encodeJsonSegment({
    alg: "HS256",
    typ: "JWT",
  });
  const payloadSegment = encodeJsonSegment(payload);
  const unsignedToken = `${headerSegment}.${payloadSegment}`;
  const signatureSegment = signUnsignedToken(
    unsignedToken,
    runtimeConfig.signingSecret
  ).toString("base64url");

  return {
    accessToken: `${unsignedToken}.${signatureSegment}`,
    tokenId,
    issuedAt,
    expiresAt,
    expiresInSeconds: runtimeConfig.ttlSeconds,
  };
}

export function verifyAgentAccessToken(
  accessToken: string
): VerifiedAgentAccessTokenResult {
  let runtimeConfig;
  try {
    runtimeConfig = getAgentTokenRuntimeConfig();
  } catch {
    return {
      ok: false,
      status: 500,
      error: "agent-auth-config-invalid",
    };
  }

  const token = accessToken.trim();
  const segments = token.split(".");
  if (segments.length !== 3) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  let header: unknown;
  let payload: unknown;

  try {
    header = decodeJsonSegment(headerSegment);
    payload = decodeJsonSegment(payloadSegment);
  } catch {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  if (
    !header ||
    typeof header !== "object" ||
    (header as { alg?: string }).alg !== "HS256" ||
    (header as { typ?: string }).typ !== "JWT"
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  if (!isValidPayload(payload)) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  const unsignedToken = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = signUnsignedToken(
    unsignedToken,
    runtimeConfig.signingSecret
  );

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + 60 ||
    payload.sub.trim().length === 0 ||
    payload.jti.trim().length === 0 ||
    payload.projectId.trim().length === 0 ||
    payload.ownerUserId.trim().length === 0
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  return {
    ok: true,
    data: {
      credentialId: payload.sub,
      projectId: payload.projectId,
      ownerUserId: payload.ownerUserId,
      scopes: parseAgentScopes(payload.scopes),
      tokenId: payload.jti,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
    },
  };
}
