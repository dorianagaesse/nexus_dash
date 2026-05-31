import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  addTaskCommentReaction,
  listTaskCommentReactionsForComment,
} from "@/lib/services/project-task-comment-service";

interface ReactionToggleRequestBody {
  emoji?: unknown;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string; commentId: string }> }
) {
  const params = await props.params;
  if (!params.projectId || !params.taskId || !params.commentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await listTaskCommentReactionsForComment({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    commentId: params.commentId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ reactions: result.data.reactions });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string; commentId: string }> }
) {
  const params = await props.params;
  if (!params.projectId || !params.taskId || !params.commentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: ReactionToggleRequestBody;
  try {
    payload = (await request.json()) as ReactionToggleRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/comments/:commentId/reactions.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await addTaskCommentReaction({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    commentId: params.commentId,
    emoji: typeof payload.emoji === "string" ? payload.emoji : "",
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { reactions: result.data.reactions },
    { headers: withProjectActivityVersionHeader() }
  );
}
