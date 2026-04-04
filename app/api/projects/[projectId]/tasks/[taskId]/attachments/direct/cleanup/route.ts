import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { cleanupTaskDirectUploadObject } from "@/lib/services/project-attachment-service";

interface CleanupDirectUploadRequestBody {
  storageKey?: unknown;
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: CleanupDirectUploadRequestBody;
  try {
    payload = (await request.json()) as CleanupDirectUploadRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/attachments/direct/cleanup.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await cleanupTaskDirectUploadObject({
    actorUserId,
    projectId,
    taskId,
    storageKey: typeof payload.storageKey === "string" ? payload.storageKey : "",
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
