import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import {
  createTaskCommentForProject,
  listTaskCommentsForProject,
} from "@/lib/services/project-task-comment-service";

interface TaskCommentCreateRequestBody {
  content?: unknown;
  mentionSelections?: unknown;
}

function parseMentionSelections(
  value: unknown
): Array<{ userId: string; username: string; discriminator: string | null }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const selections: Array<{
    userId: string;
    username: string;
    discriminator: string | null;
  }> = [];

  for (const entry of value.slice(0, 50)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const userId =
      typeof candidate.userId === "string" ? candidate.userId.trim() : "";
    const username =
      typeof candidate.username === "string" ? candidate.username.trim() : "";
    const discriminator =
      typeof candidate.discriminator === "string"
        ? candidate.discriminator.trim()
        : null;

    if (!userId || !username) {
      continue;
    }

    selections.push({
      userId,
      username,
      discriminator: discriminator || null,
    });
  }

  return selections;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const timing = startServerTiming("task.comments.list");
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
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  return NextResponse.json(
    {
      comments: result.data.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: comment.author,
      })),
    },
    { headers: timing.headers() }
  );
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const timing = startServerTiming("task.comment.create");
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
    mentionSelections: parseMentionSelections(payload.mentionSelections),
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
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
    { status: 201, headers: timing.headers() }
  );
}
