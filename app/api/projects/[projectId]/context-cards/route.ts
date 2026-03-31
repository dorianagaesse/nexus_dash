import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { createContextCardForProject } from "@/lib/services/context-card-service";
import { listProjectContextResources } from "@/lib/services/project-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

const ATTACHMENT_FILES_FIELD = "attachmentFiles";

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

  const attachmentFiles = readAttachmentFiles(formData);
  if (
    principalResult.principal.kind === "agent" &&
    attachmentFiles.length > 0
  ) {
    return NextResponse.json(
      { error: "agent-file-attachments-not-supported" },
      { status: 400 }
    );
  }

  const result = await createContextCardForProject({
    actorUserId,
    projectId,
    title: readText(formData, "title"),
    content: readText(formData, "content"),
    color: readText(formData, "color"),
    attachmentLinksJsonRaw: readText(formData, "attachmentLinks"),
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
