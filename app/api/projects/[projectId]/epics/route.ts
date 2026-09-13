import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  createProjectEpic,
  listProjectEpics,
} from "@/lib/services/project-epic-service";
import { serializeProjectEpicResponse } from "@/lib/services/project-epic-response";

interface ProjectEpicRequestBody {
  name?: unknown;
  description?: unknown;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived")?.trim().toLowerCase() ===
    "true";

  const epics = await listProjectEpics(
    params.projectId,
    principalResult.principal.actorUserId,
    getAgentProjectAccessContext(principalResult.principal),
    { includeArchived }
  );

  return NextResponse.json({
    epics: epics.map(serializeProjectEpicResponse),
  });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
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
      "POST /api/projects/:projectId/epics.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await createProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    name: typeof payload.name === "string" ? payload.name : "",
    description: typeof payload.description === "string" ? payload.description : "",
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      epic: serializeProjectEpicResponse(result.data.epic),
    },
    { status: 201 }
  );
}
