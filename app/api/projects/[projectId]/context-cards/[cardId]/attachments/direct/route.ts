import { NextRequest, NextResponse } from "next/server";

import { logServerWarning } from "@/lib/observability/logger";
import { finalizeContextAttachmentDirectUpload } from "@/lib/services/project-attachment-service";

interface FinalizeDirectUploadRequestBody {
  storageKey?: unknown;
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
    projectId,
    cardId,
    storageKey: typeof payload.storageKey === "string" ? payload.storageKey : "",
    name: typeof payload.name === "string" ? payload.name : "",
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "",
    sizeBytes:
      typeof payload.sizeBytes === "number" ? payload.sizeBytes : Number.NaN,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ attachment: result.data });
}
