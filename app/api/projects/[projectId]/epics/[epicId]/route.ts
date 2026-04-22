import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  deleteProjectEpic,
  updateProjectEpic,
} from "@/lib/services/project-epic-service";

interface ProjectEpicRequestBody {
  name?: unknown;
  description?: unknown;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: ProjectEpicRequestBody;
  try {
    payload = (await request.json()) as ProjectEpicRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/epics/:epicId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await updateProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    name: typeof payload.name === "string" ? payload.name : "",
    description: typeof payload.description === "string" ? payload.description : "",
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    epic: {
      ...result.data.epic,
      createdAt: result.data.epic.createdAt.toISOString(),
      updatedAt: result.data.epic.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await deleteProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
