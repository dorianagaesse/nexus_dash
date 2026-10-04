import crypto from "node:crypto";

import {
  getSupabaseClientRuntimeConfig,
  getSupabaseRealtimeTokenRuntimeConfig,
} from "@/lib/env.server";
import { recordRealtimeCounter } from "@/lib/observability/realtime-metrics";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function issueRealtimeToken(userId: string) {
  const { signingSecret, ttlSeconds } = getSupabaseRealtimeTokenRuntimeConfig();
  const supabase = getSupabaseClientRuntimeConfig();
  if (!supabase) {
    throw new Error("Supabase client configuration is required for Broadcast.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const unsignedToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: issuedAt,
    exp: expiresAt,
  })}`;
  const signature = crypto
    .createHmac("sha256", signingSecret)
    .update(unsignedToken)
    .digest("base64url");

  recordRealtimeCounter("broadcast.tokenIssued");
  return {
    token: `${unsignedToken}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    supabaseUrl: supabase.url,
    supabasePublishableKey: supabase.publishableKey,
  };
}
