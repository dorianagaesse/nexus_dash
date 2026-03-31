import {
  CONTEXT_CARD_COLORS,
  isContextCardColor,
} from "@/lib/context-card-colors";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { logServerError } from "@/lib/observability/logger";
import { coerceRichTextHtml, richTextToPlainText } from "@/lib/rich-text";
import { createContextAttachmentsFromDraft } from "@/lib/services/project-attachment-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

const MIN_TITLE_LENGTH = 2;
const MAX_CONTEXT_TITLE_LENGTH = 120;
const MAX_CONTEXT_CONTENT_LENGTH = 4000;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

interface CreateContextCardInput {
  actorUserId: string;
  projectId: string;
  title: string;
  content: string;
  color: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
  agentAccess?: AgentProjectAccessContext;
}

interface UpdateContextCardInput {
  actorUserId: string;
  projectId: string;
  cardId: string;
  title: string;
  content: string;
  color: string;
  agentAccess?: AgentProjectAccessContext;
}

interface DeleteContextCardInput {
  actorUserId: string;
  projectId: string;
  cardId: string;
  agentAccess?: AgentProjectAccessContext;
}

interface ContextCardAttachmentRecord {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

interface ContextCardRecord {
  id: string;
  name: string;
  content: string;
  color: string | null;
  attachments: ContextCardAttachmentRecord[];
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function resolveContextColor(value: string): string | null {
  if (!value) {
    return CONTEXT_CARD_COLORS[0];
  }

  if (!isContextCardColor(value)) {
    return null;
  }

  return value;
}

function mapContextCardRecord(card: ContextCardRecord) {
  return {
    id: card.id,
    title: card.name,
    content: card.content,
    color: card.color ?? CONTEXT_CARD_COLORS[0],
    attachments: card.attachments,
  };
}

export async function createContextCardForProject(
  input: CreateContextCardInput
): Promise<
  ServiceResult<{
    id: string;
    card: ReturnType<typeof mapContextCardRecord>;
  }>
> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const title = normalizeText(input.title);
  const content = coerceRichTextHtml(normalizeText(input.content)) ?? "";
  const color = resolveContextColor(normalizeText(input.color));

  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    return createError(400, "context-title-too-long");
  }

  if (richTextToPlainText(content).length > MAX_CONTEXT_CONTENT_LENGTH) {
    return createError(400, "context-content-too-long");
  }

  if (!color) {
    return createError(400, "context-color-invalid");
  }

  const parsedLinks = parseAttachmentLinksJson(input.attachmentLinksJsonRaw);
  if (parsedLinks.error) {
    return createError(400, parsedLinks.error);
  }

  const attachmentFileError = validateAttachmentFiles(input.attachmentFiles);
  if (attachmentFileError) {
    return createError(400, attachmentFileError);
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["context:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  let createdCardId: string | null = null;

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const createdCard = await db.resource.create({
        data: {
          projectId: input.projectId,
          type: RESOURCE_TYPE_CONTEXT_CARD,
          name: title,
          content,
          color,
        },
        select: { id: true },
      });
      createdCardId = createdCard.id;

      await createContextAttachmentsFromDraft({
        actorUserId,
        projectId: input.projectId,
        cardId: createdCard.id,
        links: parsedLinks.links,
        files: input.attachmentFiles,
        db,
      });

      const createdCardWithAttachments = await db.resource.findUnique({
        where: { id: createdCard.id },
        select: {
          id: true,
          name: true,
          content: true,
          color: true,
          attachments: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              kind: true,
              name: true,
              url: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });

      if (!createdCardWithAttachments) {
        return createError(500, "context-create-failed");
      }

      return {
        ok: true,
        data: {
          id: createdCard.id,
          card: mapContextCardRecord(createdCardWithAttachments),
        },
      };
    } catch (error) {
      if (createdCardId) {
        await db.resource
          .delete({
            where: { id: createdCardId },
          })
          .catch((cleanupError) => {
            logServerError("createContextCardForProject.cleanup", cleanupError);
          });
      }

      logServerError("createContextCardForProject", error);
      return createError(500, "context-create-failed");
    }
  });
}

export async function updateContextCardForProject(
  input: UpdateContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const cardId = normalizeText(input.cardId);
  const title = normalizeText(input.title);
  const content = coerceRichTextHtml(normalizeText(input.content)) ?? "";
  const color = resolveContextColor(normalizeText(input.color));

  if (!cardId) {
    return createError(400, "context-card-missing");
  }

  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    return createError(400, "context-title-too-long");
  }

  if (richTextToPlainText(content).length > MAX_CONTEXT_CONTENT_LENGTH) {
    return createError(400, "context-content-too-long");
  }

  if (!color) {
    return createError(400, "context-color-invalid");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["context:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingCard = await db.resource.findUnique({
        where: { id: cardId },
        select: { id: true, projectId: true, type: true },
      });

      if (
        !existingCard ||
        existingCard.projectId !== input.projectId ||
        existingCard.type !== RESOURCE_TYPE_CONTEXT_CARD
      ) {
        return createError(404, "context-card-not-found");
      }

      await db.resource.update({
        where: { id: cardId },
        data: {
          name: title,
          content,
          color,
        },
      });

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      logServerError("updateContextCardForProject", error);
      return createError(500, "context-update-failed");
    }
  });
}

export async function deleteContextCardForProject(
  input: DeleteContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const cardId = normalizeText(input.cardId);

  if (!cardId) {
    return createError(400, "context-card-missing");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["context:delete"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const existingCard = await db.resource.findUnique({
        where: { id: cardId },
        select: { id: true, projectId: true, type: true },
      });

      if (
        !existingCard ||
        existingCard.projectId !== input.projectId ||
        existingCard.type !== RESOURCE_TYPE_CONTEXT_CARD
      ) {
        return createError(404, "context-card-not-found");
      }

      await db.resource.delete({
        where: { id: cardId },
      });

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      logServerError("deleteContextCardForProject", error);
      return createError(500, "context-delete-failed");
    }
  });
}
