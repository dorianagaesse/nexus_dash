import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { uploadMeetingScreenshot } from "@/lib/services/meeting-note-screenshot-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) return user.response;
  const { projectId } = await props.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json(
      { error: "Choose an image file" },
      { status: 400 }
    );
  const result = await uploadMeetingScreenshot({
    actorUserId: user.userId,
    projectId,
    section: String(form.get("section") ?? ""),
    file,
  });
  return result.ok
    ? NextResponse.json(result.data, { status: 201 })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
