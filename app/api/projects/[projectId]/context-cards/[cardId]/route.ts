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

  const result = await updateContextCardForProject({
    actorUserId,
    projectId,
    cardId,
    title: readText(formData, "title"),
    content: readText(formData, "content"),
    color: readText(formData, "color"),
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
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
