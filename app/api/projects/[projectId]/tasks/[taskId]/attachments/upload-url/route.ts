import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { logServerWarning } from "@/lib/observability/logger";
import { createTaskAttachmentUploadTarget } from "@/lib/services/project-attachment-service";

interface UploadUrlRequestBody {
  name?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const actorUserId = (await getSessionUserIdFromRequest(request)) ?? "";
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: UploadUrlRequestBody;
  try {
    payload = (await request.json()) as UploadUrlRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/attachments/upload-url.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await createTaskAttachmentUploadTarget({
    actorUserId,
    projectId,
    taskId,
    name: typeof payload.name === "string" ? payload.name : "",
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "",
    sizeBytes:
      typeof payload.sizeBytes === "number" ? payload.sizeBytes : Number.NaN,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
