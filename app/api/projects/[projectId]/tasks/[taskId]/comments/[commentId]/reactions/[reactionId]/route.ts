import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { removeTaskCommentReaction } from "@/lib/services/project-task-comment-service";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string; commentId: string; reactionId: string }> }
) {
  const params = await props.params;
  if (!params.projectId || !params.taskId || !params.commentId || !params.reactionId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await removeTaskCommentReaction({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    reactionId: params.reactionId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ reactions: result.data.reactions });
}
