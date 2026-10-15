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
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import { coerceRichTextHtml, richTextToPlainText } from "@/lib/rich-text";
import {
  createContextAttachmentsFromDraft,
  mapContextAttachmentResponse,
} from "@/lib/services/project-attachment-service";
import {
  loadContextCardActorRegistry,
  resolveContextCardMutationActor,
} from "@/lib/services/context-card-actor-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";
import {
  contextCardAttachmentSelect,
  contextCardCardSelect,
  projectContextCard,
  recordContextCardCreator,
  recordContextCardEditor,
  type ContextCardProjection,
} from "@/lib/services/context-card-projection-service";
import type { VersionedContent } from "@/lib/content-revision";
import { editConflict, lockContentRevision } from "@/lib/services/content-revision-service";

const MIN_TITLE_LENGTH = 2;
const MAX_CONTEXT_TITLE_LENGTH = 120;
const MAX_CONTEXT_CONTENT_LENGTH = 4000;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
  current?: VersionedContent;
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
  title?: string;
  content?: string;
  color?: string;
  expectedRevision?: number;
  agentAccess?: AgentProjectAccessContext;
}

interface DeleteContextCardInput {
  actorUserId: string;
  projectId: string;
  cardId: string;
  agentAccess?: AgentProjectAccessContext;
}

export interface ContextCardAttachmentResponsePayload {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface ContextCardResponse {
  id: string;
  contentRevision: number;
  title: string;
  content: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
  attachments: ContextCardAttachmentResponsePayload[];
  projection: ContextCardProjection;
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

function mapContextCardResponse(input: {
  projectId: string;
  card: {
    id: string;
    contentRevision: number;
    name: string;
    content: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  attachments: Array<{
    id: string;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }>;
  projection: ContextCardProjection;
}): ContextCardResponse {
  return {
    id: input.card.id,
    contentRevision: input.card.contentRevision,
    title: input.card.name,
    content: input.card.content,
    color: input.card.color ?? CONTEXT_CARD_COLORS[0],
    createdAt: input.card.createdAt,
    updatedAt: input.card.updatedAt,
    attachments: input.attachments.map((attachment) =>
      mapContextAttachmentResponse(input.projectId, input.card.id, attachment)
    ),
    projection: input.projection,
  };
}

export async function createContextCardForProject(
  input: CreateContextCardInput
): Promise<
  ServiceResult<{
    id: string;
    card: ContextCardResponse;
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

  if (
    input.agentAccess &&
    (parsedLinks.links.length > 0 || input.attachmentFiles.length > 0)
  ) {
    return createError(403, "agent-context-attachments-unsupported");
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

    const mutationActor = await resolveContextCardMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
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

      await recordContextCardCreator({
        db,
        cardId: createdCard.id,
        creator: {
          userId: mutationActor.actor.userId,
          credentialId: mutationActor.actor.credentialId,
          displayNameSnapshot: mutationActor.actor.displayNameSnapshot,
          kind: mutationActor.actor.summary.kind,
        },
      });

      await createContextAttachmentsFromDraft({
        actorUserId,
        projectId: input.projectId,
        cardId: createdCard.id,
        links: parsedLinks.links,
        files: input.attachmentFiles,
        db,
        uploaderDisplayNameSnapshot: mutationActor.actor.displayNameSnapshot,
      });

      const createdCardWithAttachments = await db.resource.findUnique({
        where: { id: createdCard.id },
        select: {
          ...contextCardCardSelect,
          createdAt: true,
          attachments: {
            orderBy: [{ createdAt: "desc" }],
            select: contextCardAttachmentSelect,
          },
        },
      });

      if (!createdCardWithAttachments) {
        return createError(500, "context-create-failed");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      const registry = await loadContextCardActorRegistry({
        db,
        projectId: input.projectId,
      });
      const projection = projectContextCard({
        card: createdCardWithAttachments,
        registry,
      });

      const response = mapContextCardResponse({
        projectId: input.projectId,
        card: {
          id: createdCard.id,
          contentRevision: createdCardWithAttachments.contentRevision,
          name: title,
          content,
          color,
          createdAt: createdCardWithAttachments.createdAt,
          updatedAt: createdCardWithAttachments.updatedAt,
        },
        attachments: createdCardWithAttachments.attachments,
        projection,
      });

      return {
        ok: true,
        data: {
          id: createdCard.id,
          card: response,
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
): Promise<ServiceResult<ContextCardResponse>> {
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

  if (input.title !== undefined && title.length < MIN_TITLE_LENGTH) {
    return createError(400, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    return createError(400, "context-title-too-long");
  }

  if (richTextToPlainText(content).length > MAX_CONTEXT_CONTENT_LENGTH) {
    return createError(400, "context-content-too-long");
  }

  if (input.color !== undefined && !color) {
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

    const mutationActor = await resolveContextCardMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
    }

    try {
      const precondition = await lockContentRevision({
        db, domain: "context-card", projectId: input.projectId,
        id: cardId, expectedRevision: input.expectedRevision,
      });
      if (precondition === "missing") return createError(404, "context-card-not-found");
      if (precondition === "conflict") {
        const current = await readContextCardById(db, input.projectId, cardId);
        return current ? editConflict(current) : createError(404, "context-card-not-found");
      }
      const existingCard = await db.resource.findFirst({
        where: {
          id: cardId,
          projectId: input.projectId,
          type: RESOURCE_TYPE_CONTEXT_CARD,
        },
        select: { id: true },
      });

      if (!existingCard) {
        return createError(404, "context-card-not-found");
      }

      await db.resource.update({
        where: { id: cardId },
        data: {
          ...(input.title !== undefined ? { name: title } : {}),
          ...(input.content !== undefined ? { content } : {}),
          ...(input.color !== undefined ? { color: color! } : {}),
        },
      });

      await recordContextCardEditor({
        db,
        cardId,
        editor: {
          userId: mutationActor.actor.userId,
          credentialId: mutationActor.actor.credentialId,
          displayNameSnapshot: mutationActor.actor.displayNameSnapshot,
          kind: mutationActor.actor.summary.kind,
        },
      });

      const updatedCard = await db.resource.findUnique({
        where: { id: cardId },
        select: {
          ...contextCardCardSelect,
          name: true,
          content: true,
          color: true,
          createdAt: true,
          attachments: {
            orderBy: [{ createdAt: "desc" }],
            select: contextCardAttachmentSelect,
          },
        },
      });

      if (!updatedCard) {
        return createError(500, "context-update-failed");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      const registry = await loadContextCardActorRegistry({
        db,
        projectId: input.projectId,
      });
      const projection = projectContextCard({
        card: updatedCard,
        registry,
      });

      return {
        ok: true,
        data: mapContextCardResponse({
          projectId: input.projectId,
          card: {
            id: updatedCard.id,
            contentRevision: updatedCard.contentRevision,
            name: updatedCard.name,
            content: updatedCard.content,
            color: updatedCard.color,
            createdAt: updatedCard.createdAt,
            updatedAt: updatedCard.updatedAt,
          },
          attachments: updatedCard.attachments,
          projection,
        }),
      };
    } catch (error) {
      logServerError("updateContextCardForProject", error);
      return createError(500, "context-update-failed");
    }
  }, { forceTransaction: input.expectedRevision !== undefined });
}

async function readContextCardById(db: DbClient, projectId: string, cardId: string): Promise<ContextCardResponse | null> {
  const card = await db.resource.findFirst({
    where: { id: cardId, projectId, type: RESOURCE_TYPE_CONTEXT_CARD },
    select: {
      ...contextCardCardSelect, name: true, content: true, color: true, createdAt: true,
      attachments: { orderBy: [{ createdAt: "desc" }], select: contextCardAttachmentSelect },
    },
  });
  if (!card) return null;
  const registry = await loadContextCardActorRegistry({ db, projectId });
  return mapContextCardResponse({
    projectId, card, attachments: card.attachments,
    projection: projectContextCard({ card, registry }),
  });
}

export async function getContextCardForProject(input: {
  actorUserId: string; projectId: string; cardId: string; agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<ContextCardResponse>> {
  if (!input.actorUserId.trim()) return createError(401, "unauthorized");
  const scope = requireAgentProjectScopes({ agentAccess: input.agentAccess, projectId: input.projectId, requiredScopes: ["context:read"] });
  if (!scope.ok) return createError(scope.status, scope.error);
  return withActorRlsContext(input.actorUserId, async (db) => {
    const access = await requireProjectRole({ actorUserId: input.actorUserId, projectId: input.projectId, minimumRole: "viewer", db });
    if (!access.ok) return createError(access.status, access.error);
    const card = await readContextCardById(db, input.projectId, input.cardId);
    return card ? { ok: true, data: card } : createError(404, "context-card-not-found");
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
      const existingCard = await db.resource.findFirst({
        where: {
          id: cardId,
          projectId: input.projectId,
          type: RESOURCE_TYPE_CONTEXT_CARD,
        },
        select: { id: true },
      });

      if (!existingCard) {
        return createError(404, "context-card-not-found");
      }

      await db.resource.delete({
        where: { id: cardId },
      });

      await touchProjectActivity({ db, projectId: input.projectId });

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
