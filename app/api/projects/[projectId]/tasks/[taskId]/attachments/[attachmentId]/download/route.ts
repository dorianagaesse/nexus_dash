import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { getTaskAttachmentDownload } from "@/lib/services/project-attachment-service";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: { projectId: string; taskId: string; attachmentId: string };
  }
) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, taskId, attachmentId } = params;

  if (!projectId || !taskId || !attachmentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";

  const result = await getTaskAttachmentDownload({
    actorUserId,
    projectId,
    taskId,
    attachmentId,
    disposition,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.data.mode === "redirect" && result.data.redirectUrl) {
    return NextResponse.redirect(result.data.redirectUrl, {
      status: 307,
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  if (
    result.data.mode !== "proxy" ||
    !result.data.content ||
    !result.data.contentType ||
    !result.data.contentDisposition
  ) {
    return NextResponse.json({ error: "Invalid attachment payload" }, { status: 500 });
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
