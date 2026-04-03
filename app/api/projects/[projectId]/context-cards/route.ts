import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createContextCardForProject } from "@/lib/services/context-card-service";
import { mapContextAttachmentResponse } from "@/lib/services/project-attachment-service";
import { listProjectContextResources } from "@/lib/services/project-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

const ATTACHMENT_FILES_FIELD = "attachmentFiles";

interface ContextCardCreateJsonRequestBody {
  title?: unknown;
  content?: unknown;
  color?: unknown;
  attachmentLinks?: unknown;
}

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

function isJsonRequest(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

function serializeJsonField(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return JSON.stringify(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["context:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      { status: agentScopeAccess.status }
    );
  }

  const cards = await listProjectContextResources(
    params.projectId,
    principalResult.principal.actorUserId,
    agentAccess
  );

  return NextResponse.json({
    cards: cards.map((card) => ({
      id: card.id,
      title: card.name,
      content: card.content,
      color: card.color,
      createdAt: card.createdAt,
      attachments: card.attachments.map((attachment) =>
        mapContextAttachmentResponse(params.projectId, card.id, attachment)
      ),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId } = params;
  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  let title = "";
  let content = "";
  let color = "";
  let attachmentLinksJsonRaw = "";
  let attachmentFiles: File[] = [];

  if (isJsonRequest(request)) {
    let payload: ContextCardCreateJsonRequestBody;
    try {
      payload = (await request.json()) as ContextCardCreateJsonRequestBody;
    } catch (error) {
      logServerWarning(
        "POST /api/projects/:projectId/context-cards.invalidJson",
        "Invalid JSON payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    title = typeof payload.title === "string" ? payload.title.trim() : "";
    content = typeof payload.content === "string" ? payload.content.trim() : "";
    color = typeof payload.color === "string" ? payload.color.trim() : "";
    attachmentLinksJsonRaw = serializeJsonField(payload.attachmentLinks);
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logServerWarning(
        "POST /api/projects/:projectId/context-cards.invalidForm",
        "Invalid form payload",
        { error }
      );
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
    }

    title = readText(formData, "title");
    content = readText(formData, "content");
    color = readText(formData, "color");
    attachmentLinksJsonRaw = readText(formData, "attachmentLinks");
    attachmentFiles = readAttachmentFiles(formData);

    if (principalResult.principal.kind === "agent" && attachmentFiles.length > 0) {
      return NextResponse.json(
        { error: "agent-file-attachments-not-supported" },
        { status: 400 }
      );
    }
  }

  const result = await createContextCardForProject({
    actorUserId,
    projectId,
    title,
    content,
    color,
    attachmentLinksJsonRaw,
    attachmentFiles,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { cardId: result.data.id, card: result.data.card },
    { status: 201 }
  );
}
