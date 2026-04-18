import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  createTaskCommentForProject,
  listTaskCommentsForProject,
} from "@/lib/services/project-task-comment-service";

interface TaskCommentCreateRequestBody {
  content?: unknown;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
  if (!params.projectId || !params.taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const result = await listTaskCommentsForProject({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    taskId: params.taskId,
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    comments: result.data.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: comment.author,
    })),
  });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const params = await props.params;
  if (!params.projectId || !params.taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: TaskCommentCreateRequestBody;
  try {
    payload = (await request.json()) as TaskCommentCreateRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/tasks/:taskId/comments.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await createTaskCommentForProject({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    taskId: params.taskId,
    content: typeof payload.content === "string" ? payload.content : "",
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      comment: {
        id: result.data.comment.id,
        content: result.data.comment.content,
        createdAt: result.data.comment.createdAt,
        author: result.data.comment.author,
      },
    },
    { status: 201 }
  );
}
