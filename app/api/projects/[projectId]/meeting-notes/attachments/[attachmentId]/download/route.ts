import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { getMeetingScreenshotDownload } from "@/lib/services/meeting-note-screenshot-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  const result = await getMeetingScreenshotDownload({
    ...(await props.params),
    actorUserId: user.userId,
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  const disposition =
    request.nextUrl.searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";
  return new NextResponse(new Uint8Array(result.data.content), {
    headers: {
      "Content-Type": result.data.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(result.data.name).replace(/'/g, "%27")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
