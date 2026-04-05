import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createContextAttachmentFromForm } from "@/lib/services/project-attachment-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }
  const actorUserId = authenticatedUser.userId;
  const { projectId, cardId } = params;

  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/context-cards/:cardId/attachments.invalidForm",
      "Invalid form payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const result = await createContextAttachmentFromForm({
    actorUserId,
    projectId,
    cardId,
    formData,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ attachment: result.data });
}
