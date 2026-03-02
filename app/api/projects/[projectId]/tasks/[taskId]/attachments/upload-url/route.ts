import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createRouteTimer } from "@/lib/observability/server-timing";
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
  const timer = createRouteTimer(
    "POST /api/projects/:projectId/tasks/:taskId/attachments/upload-url",
    request
  );
  const authenticatedUser = await timer.measure("auth", () =>
    requireAuthenticatedApiUser(request)
  );
  if (!authenticatedUser.ok) {
    return timer.finalize({ response: authenticatedUser.response });
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return timer.finalize({
      response: NextResponse.json({ error: "Missing route parameters" }, { status: 400 }),
    });
  }

  let payload: UploadUrlRequestBody;
  try {
    payload = await timer.measure("parse", () =>
      request.json() as Promise<UploadUrlRequestBody>
    );
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/attachments/upload-url.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return timer.finalize({
      response: NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
    });
  }

  const result = await timer.measure("service:uploadTarget", () =>
    createTaskAttachmentUploadTarget({
      actorUserId,
      projectId,
      taskId,
      name: typeof payload.name === "string" ? payload.name : "",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "",
      sizeBytes:
        typeof payload.sizeBytes === "number" ? payload.sizeBytes : Number.NaN,
    })
  );

  if (!result.ok) {
    return timer.finalize({
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    });
  }

  return timer.finalize({
    response: NextResponse.json(result.data),
  });
}
