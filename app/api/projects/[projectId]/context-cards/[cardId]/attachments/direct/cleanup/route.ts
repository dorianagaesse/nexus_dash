import { NextRequest, NextResponse } from "next/server";

import { logServerWarning } from "@/lib/observability/logger";
import { cleanupContextDirectUploadObject } from "@/lib/services/project-attachment-service";

interface CleanupDirectUploadRequestBody {
  storageKey?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const { projectId, cardId } = params;

  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: CleanupDirectUploadRequestBody;
  try {
    payload = (await request.json()) as CleanupDirectUploadRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/context-cards/:cardId/attachments/direct/cleanup.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await cleanupContextDirectUploadObject({
    projectId,
    cardId,
    storageKey: typeof payload.storageKey === "string" ? payload.storageKey : "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
