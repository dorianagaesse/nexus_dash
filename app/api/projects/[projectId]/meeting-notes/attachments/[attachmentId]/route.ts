import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { deleteMeetingScreenshotDraft } from "@/lib/services/meeting-note-screenshot-service";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  const result = await deleteMeetingScreenshotDraft({
    ...(await props.params),
    actorUserId: user.userId,
  });
  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
