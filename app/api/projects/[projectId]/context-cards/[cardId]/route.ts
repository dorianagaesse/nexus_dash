import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createRouteTimer } from "@/lib/observability/server-timing";
import {
  deleteContextCardForProject,
  updateContextCardForProject,
} from "@/lib/services/context-card-service";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const timer = createRouteTimer(
    "PATCH /api/projects/:projectId/context-cards/:cardId",
    request
  );
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return timer.finalize({
      response: NextResponse.json({ error: "Missing route parameters" }, { status: 400 }),
    });
  }

  let formData: FormData;
  try {
    formData = await timer.measure("parse", () => request.formData());
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/context-cards/:cardId.invalidForm",
      "Invalid form payload",
      { error }
    );
    return timer.finalize({
      response: NextResponse.json({ error: "Invalid form payload" }, { status: 400 }),
    });
  }

  const result = await timer.measure("service:update", () =>
    updateContextCardForProject({
      actorUserId,
      projectId,
      cardId,
      title: readText(formData, "title"),
      content: readText(formData, "content"),
      color: readText(formData, "color"),
    })
  );

  if (!result.ok) {
    return timer.finalize({
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    });
  }

  return timer.finalize({
    response: NextResponse.json({ ok: true }),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const timer = createRouteTimer(
    "DELETE /api/projects/:projectId/context-cards/:cardId",
    request
  );
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return timer.finalize({
      response: NextResponse.json({ error: "Missing route parameters" }, { status: 400 }),
    });
  }

  const result = await timer.measure("service:delete", () =>
    deleteContextCardForProject({
      actorUserId,
      projectId,
      cardId,
    })
  );

  if (!result.ok) {
    return timer.finalize({
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    });
  }

  return timer.finalize({
    response: NextResponse.json({ ok: true }),
  });
}
