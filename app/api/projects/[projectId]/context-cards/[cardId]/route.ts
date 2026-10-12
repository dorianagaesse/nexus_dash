import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { startServerTiming } from "@/lib/observability/server-timing";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { contentErrorBody, parseContentIfMatch, withContentEtag, withContentMutationHeaders } from "@/lib/content-revision";
import {
  deleteContextCardForProject,
  getContextCardForProject,
  updateContextCardForProject,
  type ContextCardResponse,
} from "@/lib/services/context-card-service";

interface ContextCardUpdateJsonRequestBody {
  title?: unknown;
  content?: unknown;
  color?: unknown;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function isJsonRequest(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

function serializeContextCard(card: ContextCardResponse) {
  return {
    ...card,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    projection: {
      ...card.projection,
      attachments: card.projection.attachments.map((attachment) => ({
        ...attachment,
        uploadedAt: attachment.uploadedAt.toISOString(),
      })),
    },
  };
}

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string; cardId: string }> }) {
  const params = await props.params;
  const principal = await requireApiPrincipal(request);
  if (!principal.ok) return principal.response;
  const result = await getContextCardForProject({
    ...params, actorUserId: principal.principal.actorUserId,
    agentAccess: getAgentProjectAccessContext(principal.principal),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ card: serializeContextCard(result.data) }, { headers: withContentEtag({}, "context-card", result.data) });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const timing = startServerTiming("context.update");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const precondition = parseContentIfMatch(request.headers.get("if-match"), "context-card", cardId);
  if (!precondition.ok) return NextResponse.json({ error: precondition.error }, { status: 400 });
  let title: string | undefined;
  let content: string | undefined;
  let color: string | undefined;

  if (isJsonRequest(request)) {
    let payload: ContextCardUpdateJsonRequestBody;
    try {
      payload = (await request.json()) as ContextCardUpdateJsonRequestBody;
    } catch (error) {
      logServerWarning(
        "PATCH /api/projects/:projectId/context-cards/:cardId.invalidJson",
        "Invalid JSON payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      ["title", "content", "color"].some((field) => {
        const value = (payload as Record<string, unknown>)[field];
        return value !== undefined && typeof value !== "string";
      })) {
      return NextResponse.json({ error: "invalid-request-body" }, { status: 400 });
    }

    title = typeof payload.title === "string" ? payload.title.trim() : undefined;
    content = typeof payload.content === "string" ? payload.content.trim() : undefined;
    color = typeof payload.color === "string" ? payload.color.trim() : undefined;
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logServerWarning(
        "PATCH /api/projects/:projectId/context-cards/:cardId.invalidForm",
        "Invalid form payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
    }

    title = formData.has("title") ? readText(formData, "title") : undefined;
    content = formData.has("content") ? readText(formData, "content") : undefined;
    color = formData.has("color") ? readText(formData, "color") : undefined;
  }

  const result = await updateContextCardForProject({
    actorUserId,
    projectId,
    cardId,
    title,
    content,
    color,
    agentAccess,
    ...(precondition.expectedRevision === undefined ? {} : { expectedRevision: precondition.expectedRevision }),
  });

  if (!result.ok) {
    return NextResponse.json(
      contentErrorBody(result),
      { status: result.status, headers: result.current ? withContentEtag(timing.headers(), "context-card", result.current) : timing.headers() }
    );
  }

  const serializedCard = serializeContextCard(result.data);
  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "context-card",
    action: "updated",
    entityId: cardId,
    payload: {
      card: serializedCard,
    },
  });

  return NextResponse.json(
    {
      card: serializedCard,
    },
    { headers: withContentMutationHeaders(withProjectActivityVersionHeader(timing.headers(), version), "context-card", result.data) }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const timing = startServerTiming("context.delete");
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await deleteContextCardForProject({
    actorUserId,
    projectId,
    cardId,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "context-card",
    action: "deleted",
    entityId: cardId,
    payload: { cardId },
  });

  return NextResponse.json(
    { ok: true },
    { headers: withProjectActivityVersionHeader(timing.headers(), version) }
  );
}
