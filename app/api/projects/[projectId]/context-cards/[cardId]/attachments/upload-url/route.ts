import { NextRequest, NextResponse } from "next/server";

import { logServerWarning } from "@/lib/observability/logger";
import { createContextAttachmentUploadTarget } from "@/lib/services/project-attachment-service";

interface UploadUrlRequestBody {
  name?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const { projectId, cardId } = params;

  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: UploadUrlRequestBody;
  try {
    payload = (await request.json()) as UploadUrlRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/context-cards/:cardId/attachments/upload-url.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await createContextAttachmentUploadTarget({
    projectId,
    cardId,
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
