import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { finalizeContextAttachmentDirectUpload } from "@/lib/services/project-attachment-service";

interface FinalizeDirectUploadRequestBody {
  storageKey?: unknown;
  name?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}

export async function POST(
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

  let payload: FinalizeDirectUploadRequestBody;
  try {
    payload = (await request.json()) as FinalizeDirectUploadRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/context-cards/:cardId/attachments/direct.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await finalizeContextAttachmentDirectUpload({
    actorUserId,
    projectId,
    cardId,
    storageKey: typeof payload.storageKey === "string" ? payload.storageKey : "",
    name: typeof payload.name === "string" ? payload.name : "",
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "",
    sizeBytes:
      typeof payload.sizeBytes === "number" ? payload.sizeBytes : Number.NaN,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "attachment",
    action: "created",
    entityId: result.data.id,
    payload: { cardId, attachment: result.data },
    agentAccess,
    entityDisplayNameSnapshot: result.data.name,
  });

  return NextResponse.json(
    { attachment: result.data },
    { headers: withProjectActivityVersionHeader(undefined, version) }
  );
}
