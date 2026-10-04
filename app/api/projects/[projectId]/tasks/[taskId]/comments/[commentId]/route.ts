import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { updateTaskCommentForProject } from "@/lib/services/project-task-comment-service";

interface TaskCommentUpdateRequestBody {
  content?: unknown;
  agentMentionSelections?: unknown;
}

function parseAgentMentionSelections(
  value: unknown
): Array<{ credentialId: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const selections: Array<{ credentialId: string }> = [];

  for (const entry of value.slice(0, 50)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const credentialId =
      typeof candidate.credentialId === "string"
        ? candidate.credentialId.trim()
        : "";

    if (!credentialId) {
      continue;
    }

    selections.push({ credentialId });
  }

  return selections;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; taskId: string; commentId: string }> }
) {
  const timing = startServerTiming("task.comment.update");
  const params = await props.params;
  if (!params.projectId || !params.taskId || !params.commentId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: TaskCommentUpdateRequestBody;
  try {
    payload = (await request.json()) as TaskCommentUpdateRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/tasks/:taskId/comments/:commentId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || typeof payload.content !== "string") {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await updateTaskCommentForProject({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    taskId: params.taskId,
    commentId: params.commentId,
    content: payload.content,
    agentMentionSelections: parseAgentMentionSelections(
      payload.agentMentionSelections
    ),
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  const comment = {
    id: result.data.comment.id,
    content: result.data.comment.content,
    createdAt: result.data.comment.createdAt,
    updatedAt: result.data.comment.updatedAt,
    author: result.data.comment.author,
    ...(result.data.comment.attachments.length > 0
      ? { attachments: result.data.comment.attachments }
      : {}),
    ...(result.data.comment.agentMentions.length > 0
      ? { agentMentions: result.data.comment.agentMentions }
      : {}),
  };

  const version = await recordProjectActivityEventVersion({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    domain: "task-comment",
    action: "updated",
    entityId: result.data.comment.id,
    payload: {
      taskId: params.taskId,
      comment,
    },
  });

  return NextResponse.json(
    {
      comment,
    },
    {
      status: 200,
      headers: withProjectActivityVersionHeader(timing.headers(), version),
    }
  );
}
