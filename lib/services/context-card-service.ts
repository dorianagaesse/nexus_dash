import {
  CONTEXT_CARD_COLORS,
  isContextCardColor,
} from "@/lib/context-card-colors";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { logServerError } from "@/lib/observability/logger";
import { createContextAttachmentsFromDraft } from "@/lib/services/project-attachment-service";
import { requireProjectRole } from "@/lib/services/project-access-service";

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
}

interface UpdateContextCardInput {
  actorUserId: string;
  projectId: string;
  cardId: string;
  title: string;
  content: string;
  color: string;
}

interface DeleteContextCardInput {
  actorUserId: string;
  projectId: string;
  cardId: string;
}

interface CreatedContextCardPayload {
  id: string;
  title: string;
  content: string;
  color: string;
  attachments: {
    id: string;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    downloadUrl: string | null;
  }[];
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

export async function createContextCardForProject(
  input: CreateContextCardInput
): Promise<ServiceResult<{ id: string; card: CreatedContextCardPayload }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const access = await requireProjectRole({
    actorUserId,
    projectId: input.projectId,
    minimumRole: "editor",
  });
  if (!access.ok) {
    return createError(access.status, access.error);
  }

  const title = normalizeText(input.title);
  const content = normalizeText(input.content);
  const color = resolveContextColor(normalizeText(input.color));

  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    return createError(400, "context-title-too-long");
  }

  if (content.length > MAX_CONTEXT_CONTENT_LENGTH) {
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

  let createdCardId: string | null = null;

  try {
    const createdCard = await prisma.resource.create({
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
    });

    const createdCardWithDetails = await prisma.resource.findUnique({
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

    if (!createdCardWithDetails) {
      throw new Error("create-context-card-details-missing");
    }

    return {
      ok: true,
      data: {
        id: createdCard.id,
        card: {
          id: createdCardWithDetails.id,
          title: createdCardWithDetails.name,
          content: createdCardWithDetails.content,
          color: createdCardWithDetails.color ?? CONTEXT_CARD_COLORS[0],
          attachments: createdCardWithDetails.attachments.map((attachment) => ({
            ...attachment,
            downloadUrl:
              attachment.kind === ATTACHMENT_KIND_FILE
                ? `/api/projects/${input.projectId}/context-cards/${createdCard.id}/attachments/${attachment.id}/download`
                : null,
          })),
        },
      },
    };
  } catch (error) {
    if (createdCardId) {
      await prisma.resource
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
}

export async function updateContextCardForProject(
  input: UpdateContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const access = await requireProjectRole({
    actorUserId,
    projectId: input.projectId,
    minimumRole: "editor",
  });
  if (!access.ok) {
    return createError(access.status, access.error);
  }

  const cardId = normalizeText(input.cardId);
  const title = normalizeText(input.title);
  const content = normalizeText(input.content);
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

  if (content.length > MAX_CONTEXT_CONTENT_LENGTH) {
    return createError(400, "context-content-too-long");
  }

  if (!color) {
    return createError(400, "context-color-invalid");
  }

  try {
    const existingCard = await prisma.resource.findUnique({
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

    await prisma.resource.update({
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
}

export async function deleteContextCardForProject(
  input: DeleteContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const access = await requireProjectRole({
    actorUserId,
    projectId: input.projectId,
    minimumRole: "editor",
  });
  if (!access.ok) {
    return createError(access.status, access.error);
  }

  const cardId = normalizeText(input.cardId);

  if (!cardId) {
    return createError(400, "context-card-missing");
  }

  try {
    const existingCard = await prisma.resource.findUnique({
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

    await prisma.resource.delete({
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
}
