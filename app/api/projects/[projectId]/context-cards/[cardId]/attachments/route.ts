import { NextRequest, NextResponse } from "next/server";

import { createContextAttachmentFromForm } from "@/lib/services/project-attachment-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const { projectId, cardId } = params;

  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    console.error(
      "[POST /api/projects/:projectId/context-cards/:cardId/attachments] invalid form",
      error
    );
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const result = await createContextAttachmentFromForm({
    projectId,
    cardId,
    formData,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ attachment: result.data });
}
