import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  archiveProjectEpic,
  unarchiveProjectEpic,
} from "@/lib/services/project-epic-service";
import { serializeProjectEpicResponse } from "@/lib/services/project-epic-response";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const { projectId, epicId } = params;
  if (!projectId || !epicId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await archiveProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId,
    epicId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      epic: serializeProjectEpicResponse(result.data.epic),
    },
    {
      headers: withProjectActivityVersionHeader(),
    }
  );
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

  const { projectId, epicId } = params;
  if (!projectId || !epicId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await unarchiveProjectEpic({
    actorUserId: principalResult.principal.actorUserId,
    projectId,
    epicId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      epic: serializeProjectEpicResponse(result.data.epic),
    },
    {
      headers: withProjectActivityVersionHeader(),
    }
  );
}
