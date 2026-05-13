import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  getNotificationEmailDispatchSecret,
  isPreviewDeployment,
} from "@/lib/env.server";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerWarning } from "@/lib/observability/logger";
import { dispatchProjectNotificationEmails } from "@/lib/services/project-notification-email-service";

export const dynamic = "force-dynamic";

function timingSafeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization) {
    return "";
  }

  const [scheme, ...valueParts] = authorization.split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") {
    return "";
  }

  return valueParts.join(" ").trim();
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const bearerToken = readBearerToken(request);
  const dispatchSecret =
    request.headers.get("x-notification-email-dispatch-secret")?.trim() ?? "";

  return (
    timingSafeEquals(bearerToken, secret) ||
    timingSafeEquals(dispatchSecret, secret)
  );
}

function resolveDispatchOrigin(request: NextRequest): string {
  if (isPreviewDeployment()) {
    return request.nextUrl.origin;
  }

  return resolveRequestOriginFromHeaders(request.headers);
}

export async function GET(request: NextRequest) {
  const secret = getNotificationEmailDispatchSecret();
  if (!secret) {
    logServerWarning(
      "GET /api/cron/notification-emails",
      "Notification email dispatch secret is not configured."
    );

    return NextResponse.json(
      { error: "notification-email-dispatch-secret-missing" },
      { status: 503 }
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await dispatchProjectNotificationEmails({
    appOrigin: resolveDispatchOrigin(request),
  });

  return NextResponse.json({ ok: true, summary });
}
