import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  isValidReorderPayload,
  reorderProjectTasks,
} from "@/lib/services/project-task-service";
import { startServerTiming } from "@/lib/observability/server-timing";

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const timing = startServerTiming("task.reorder");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const projectId = params.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/reorder.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isValidReorderPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await reorderProjectTasks(
    projectId,
    body,
    actorUserId,
    agentAccess
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "task",
    action: "reordered",
    entityId: projectId,
    payload: { reorder: body },
  });

  return NextResponse.json(
    { ok: true },
    { headers: withProjectActivityVersionHeader(timing.headers(), version) }
  );
}
