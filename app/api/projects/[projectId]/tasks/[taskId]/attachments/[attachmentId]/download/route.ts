import { NextResponse } from "next/server";

import { getTaskAttachmentDownload } from "@/lib/services/project-attachment-service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: { projectId: string; taskId: string; attachmentId: string };
  }
) {
  const { projectId, taskId, attachmentId } = params;

  if (!projectId || !taskId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";

  const result = await getTaskAttachmentDownload({
    projectId,
    taskId,
    attachmentId,
    disposition,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = new Uint8Array(result.data.content);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": result.data.contentType,
      "Content-Disposition": result.data.contentDisposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
