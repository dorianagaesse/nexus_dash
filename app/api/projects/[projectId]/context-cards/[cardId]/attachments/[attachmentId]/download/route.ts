import { NextResponse } from "next/server";

import { getContextAttachmentDownload } from "@/lib/services/project-attachment-service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: { projectId: string; cardId: string; attachmentId: string };
  }
) {
  const { projectId, cardId, attachmentId } = params;

  if (!projectId || !cardId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";

  const result = await getContextAttachmentDownload({
    projectId,
    cardId,
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
