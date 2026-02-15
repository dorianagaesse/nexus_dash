import {
  CONTEXT_CARD_COLORS,
  isContextCardColor,
} from "@/lib/context-card-colors";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { createContextAttachmentsFromDraft } from "@/lib/services/project-attachment-service";

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
  projectId: string;
  title: string;
  content: string;
  color: string;
  attachmentLinksJsonRaw: string;
  attachmentFiles: File[];
}

interface UpdateContextCardInput {
  projectId: string;
  cardId: string;
  title: string;
  content: string;
  color: string;
}

interface DeleteContextCardInput {
  projectId: string;
  cardId: string;
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
): Promise<ServiceResult<{ id: string }>> {
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
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

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
      cardId: createdCard.id,
      links: parsedLinks.links,
      files: input.attachmentFiles,
    });

    return {
      ok: true,
      data: { id: createdCard.id },
    };
  } catch (error) {
    if (createdCardId) {
      await prisma.resource
        .delete({
          where: { id: createdCardId },
        })
        .catch((cleanupError) => {
          console.error("[createContextCardForProject.cleanup]", cleanupError);
        });
    }

    console.error("[createContextCardForProject]", error);
    return createError(500, "context-create-failed");
  }
}

export async function updateContextCardForProject(
  input: UpdateContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
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
    console.error("[updateContextCardForProject]", error);
    return createError(500, "context-update-failed");
  }
}

export async function deleteContextCardForProject(
  input: DeleteContextCardInput
): Promise<ServiceResult<{ ok: true }>> {
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
    console.error("[deleteContextCardForProject]", error);
    return createError(500, "context-delete-failed");
  }
}
