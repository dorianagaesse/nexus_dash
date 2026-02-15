import { NextRequest, NextResponse } from "next/server";

import { createContextCardForProject } from "@/lib/services/context-card-service";

const ATTACHMENT_FILES_FIELD = "attachmentFiles";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function readAttachmentFiles(formData: FormData): File[] {
  return formData
    .getAll(ATTACHMENT_FILES_FIELD)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;
  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[POST /api/projects/:projectId/context-cards] invalid form", error);
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const result = await createContextCardForProject({
    projectId,
    title: readText(formData, "title"),
    content: readText(formData, "content"),
    color: readText(formData, "color"),
    attachmentLinksJsonRaw: readText(formData, "attachmentLinks"),
    attachmentFiles: readAttachmentFiles(formData),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ cardId: result.data.id }, { status: 201 });
}
