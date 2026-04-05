import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  deleteContextCardForProject,
  updateContextCardForProject,
} from "@/lib/services/context-card-service";

interface ContextCardUpdateJsonRequestBody {
  title?: unknown;
  content?: unknown;
  color?: unknown;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function isJsonRequest(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let title = "";
  let content = "";
  let color = "";

  if (isJsonRequest(request)) {
    let payload: ContextCardUpdateJsonRequestBody;
    try {
      payload = (await request.json()) as ContextCardUpdateJsonRequestBody;
    } catch (error) {
      logServerWarning(
        "PATCH /api/projects/:projectId/context-cards/:cardId.invalidJson",
        "Invalid JSON payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    title = typeof payload.title === "string" ? payload.title.trim() : "";
    content = typeof payload.content === "string" ? payload.content.trim() : "";
    color = typeof payload.color === "string" ? payload.color.trim() : "";
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logServerWarning(
        "PATCH /api/projects/:projectId/context-cards/:cardId.invalidForm",
        "Invalid form payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
    }

    title = readText(formData, "title");
    content = readText(formData, "content");
    color = readText(formData, "color");
  }

  const result = await updateContextCardForProject({
    actorUserId,
    projectId,
    cardId,
    title,
    content,
    color,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteContextCardForProject({
    actorUserId,
    projectId,
    cardId,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
