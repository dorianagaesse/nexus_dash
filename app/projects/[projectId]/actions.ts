"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteAttachmentFile, saveAttachmentFile } from "@/lib/attachment-storage";
import {
  CONTEXT_CARD_COLORS,
  isContextCardColor,
} from "@/lib/context-card-colors";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  isAllowedAttachmentMimeType,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  normalizeAttachmentUrl,
} from "@/lib/task-attachment";
import { parseTaskLabelsJson, serializeTaskLabels } from "@/lib/task-label";
import { TASK_STATUSES } from "@/lib/task-status";

const MIN_TITLE_LENGTH = 2;
const MAX_CONTEXT_TITLE_LENGTH = 120;
const MAX_CONTEXT_CONTENT_LENGTH = 4000;
const ATTACHMENT_LINKS_FIELD = "attachmentLinks";
const ATTACHMENT_FILES_FIELD = "attachmentFiles";

interface ParsedAttachmentLink {
  name: string;
  url: string;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
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

function parseAttachmentLinks(formData: FormData): {
  links: ParsedAttachmentLink[];
  error: string | null;
} {
  const rawValue = readText(formData, ATTACHMENT_LINKS_FIELD);

  if (!rawValue) {
    return { links: [], error: null };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawValue);
  } catch {
    return { links: [], error: "attachment-link-invalid" };
  }

  if (!Array.isArray(payload)) {
    return { links: [], error: "attachment-link-invalid" };
  }

  const links: ParsedAttachmentLink[] = [];

  for (const item of payload) {
    if (!item || typeof item !== "object") {
      return { links: [], error: "attachment-link-invalid" };
    }

    const linkInput = item as { name?: unknown; url?: unknown };
    const rawUrl = typeof linkInput.url === "string" ? linkInput.url.trim() : "";
    const normalizedUrl = normalizeAttachmentUrl(rawUrl);

    if (!normalizedUrl) {
      return { links: [], error: "attachment-link-invalid" };
    }

    const rawName = typeof linkInput.name === "string" ? linkInput.name.trim() : "";
    links.push({
      name: rawName || new URL(normalizedUrl).hostname,
      url: normalizedUrl,
    });
  }

  return { links, error: null };
}

function readAttachmentFiles(formData: FormData): File[] {
  return formData
    .getAll(ATTACHMENT_FILES_FIELD)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function validateAttachmentFiles(files: File[]): string | null {
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
      return "attachment-file-too-large";
    }

    if (!isAllowedAttachmentMimeType(file.type)) {
      return "attachment-file-type-invalid";
    }
  }

  return null;
}

async function createTaskAttachments(
  taskId: string,
  links: ParsedAttachmentLink[],
  files: File[]
) {
  const savedStorageKeys: string[] = [];

  try {
    if (links.length > 0) {
      await prisma.taskAttachment.createMany({
        data: links.map((link) => ({
          taskId,
          kind: ATTACHMENT_KIND_LINK,
          name: link.name,
          url: link.url,
        })),
      });
    }

    for (const file of files) {
      const storedFile = await saveAttachmentFile({
        scope: "task",
        ownerId: taskId,
        file,
      });
      savedStorageKeys.push(storedFile.storageKey);

      await prisma.taskAttachment.create({
        data: {
          taskId,
          kind: ATTACHMENT_KIND_FILE,
          name: storedFile.originalName,
          storageKey: storedFile.storageKey,
          mimeType: storedFile.mimeType,
          sizeBytes: storedFile.sizeBytes,
        },
      });
    }
  } catch (error) {
    await Promise.all(
      savedStorageKeys.map((storageKey) =>
        deleteAttachmentFile(storageKey).catch((cleanupError) => {
          console.error("[createTaskAttachments.cleanup]", cleanupError);
        })
      )
    );
    throw error;
  }
}

async function createContextCardAttachments(
  cardId: string,
  links: ParsedAttachmentLink[],
  files: File[]
) {
  const savedStorageKeys: string[] = [];

  try {
    if (links.length > 0) {
      await prisma.resourceAttachment.createMany({
        data: links.map((link) => ({
          resourceId: cardId,
          kind: ATTACHMENT_KIND_LINK,
          name: link.name,
          url: link.url,
        })),
      });
    }

    for (const file of files) {
      const storedFile = await saveAttachmentFile({
        scope: "context-card",
        ownerId: cardId,
        file,
      });
      savedStorageKeys.push(storedFile.storageKey);

      await prisma.resourceAttachment.create({
        data: {
          resourceId: cardId,
          kind: ATTACHMENT_KIND_FILE,
          name: storedFile.originalName,
          storageKey: storedFile.storageKey,
          mimeType: storedFile.mimeType,
          sizeBytes: storedFile.sizeBytes,
        },
      });
    }
  } catch (error) {
    await Promise.all(
      savedStorageKeys.map((storageKey) =>
        deleteAttachmentFile(storageKey).catch((cleanupError) => {
          console.error("[createContextCardAttachments.cleanup]", cleanupError);
        })
      )
    );
    throw error;
  }
}

function redirectWithError(projectId: string, error: string): never {
  redirect(`/projects/${projectId}?error=${error}`);
}

function redirectWithStatus(projectId: string, status: string): never {
  redirect(`/projects/${projectId}?status=${status}`);
}

function redirectWithContextError(projectId: string, error: string): never {
  redirect(`/projects/${projectId}?error=${error}`);
}

function redirectWithContextStatus(projectId: string, status: string): never {
  redirect(`/projects/${projectId}?status=${status}`);
}

export async function createTaskAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const title = readText(formData, "title");
  const rawDescription = readText(formData, "description");
  const description = sanitizeRichText(rawDescription);
  const labels = parseTaskLabelsJson(readText(formData, "labels"));
  const serializedLabels = serializeTaskLabels(labels);
  const status = TASK_STATUSES[0];

  if (title.length < MIN_TITLE_LENGTH) {
    redirectWithError(projectId, "title-too-short");
  }

  const parsedLinks = parseAttachmentLinks(formData);
  if (parsedLinks.error) {
    redirectWithError(projectId, parsedLinks.error);
  }

  const attachmentFiles = readAttachmentFiles(formData);
  const attachmentFileError = validateAttachmentFiles(attachmentFiles);
  if (attachmentFileError) {
    redirectWithError(projectId, attachmentFileError);
  }

  let createdTaskId: string | null = null;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      redirectWithError(projectId, "project-not-found");
    }

    const maxPosition = await prisma.task.aggregate({
      where: { projectId, status },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position ?? -1) + 1;

    const createdTask = await prisma.task.create({
      data: {
        projectId,
        title,
        description,
        label: labels[0] ?? null,
        labelsJson: serializedLabels,
        status,
        position: nextPosition,
      },
    });

    createdTaskId = createdTask.id;

    await createTaskAttachments(createdTask.id, parsedLinks.links, attachmentFiles);
  } catch (error) {
    if (createdTaskId) {
      await prisma.task
        .delete({
          where: { id: createdTaskId },
        })
        .catch((cleanupError) => {
          console.error("[createTaskAction.cleanup]", cleanupError);
        });
    }

    console.error("[createTaskAction]", error);
    redirectWithError(projectId, "create-failed");
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithStatus(projectId, "task-created");
}

export async function createContextCardAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const title = readText(formData, "title");
  const content = readText(formData, "content");
  const color = resolveContextColor(readText(formData, "color"));

  if (title.length < MIN_TITLE_LENGTH) {
    redirectWithContextError(projectId, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    redirectWithContextError(projectId, "context-title-too-long");
  }

  if (content.length > MAX_CONTEXT_CONTENT_LENGTH) {
    redirectWithContextError(projectId, "context-content-too-long");
  }

  if (!color) {
    redirectWithContextError(projectId, "context-color-invalid");
  }

  const parsedLinks = parseAttachmentLinks(formData);
  if (parsedLinks.error) {
    redirectWithContextError(projectId, parsedLinks.error);
  }

  const attachmentFiles = readAttachmentFiles(formData);
  const attachmentFileError = validateAttachmentFiles(attachmentFiles);
  if (attachmentFileError) {
    redirectWithContextError(projectId, attachmentFileError);
  }

  let createdCardId: string | null = null;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      redirectWithContextError(projectId, "project-not-found");
    }

    const createdCard = await prisma.resource.create({
      data: {
        projectId,
        type: RESOURCE_TYPE_CONTEXT_CARD,
        name: title,
        content,
        color,
      },
    });

    createdCardId = createdCard.id;

    await createContextCardAttachments(
      createdCard.id,
      parsedLinks.links,
      attachmentFiles
    );
  } catch (error) {
    if (createdCardId) {
      await prisma.resource
        .delete({
          where: { id: createdCardId },
        })
        .catch((cleanupError) => {
          console.error("[createContextCardAction.cleanup]", cleanupError);
        });
    }

    console.error("[createContextCardAction]", error);
    redirectWithContextError(projectId, "context-create-failed");
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithContextStatus(projectId, "context-created");
}

export async function updateContextCardAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cardId = readText(formData, "cardId");
  const title = readText(formData, "title");
  const content = readText(formData, "content");
  const color = resolveContextColor(readText(formData, "color"));

  if (!cardId) {
    redirectWithContextError(projectId, "context-card-missing");
  }

  if (title.length < MIN_TITLE_LENGTH) {
    redirectWithContextError(projectId, "context-title-too-short");
  }

  if (title.length > MAX_CONTEXT_TITLE_LENGTH) {
    redirectWithContextError(projectId, "context-title-too-long");
  }

  if (content.length > MAX_CONTEXT_CONTENT_LENGTH) {
    redirectWithContextError(projectId, "context-content-too-long");
  }

  if (!color) {
    redirectWithContextError(projectId, "context-color-invalid");
  }

  try {
    const existingCard = await prisma.resource.findUnique({
      where: { id: cardId },
      select: { id: true, projectId: true, type: true },
    });

    if (
      !existingCard ||
      existingCard.projectId !== projectId ||
      existingCard.type !== RESOURCE_TYPE_CONTEXT_CARD
    ) {
      redirectWithContextError(projectId, "context-card-not-found");
    }

    await prisma.resource.update({
      where: { id: cardId },
      data: {
        name: title,
        content,
        color,
      },
    });
  } catch (error) {
    console.error("[updateContextCardAction]", error);
    redirectWithContextError(projectId, "context-update-failed");
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithContextStatus(projectId, "context-updated");
}

export async function deleteContextCardAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cardId = readText(formData, "cardId");

  if (!cardId) {
    redirectWithContextError(projectId, "context-card-missing");
  }

  try {
    const existingCard = await prisma.resource.findUnique({
      where: { id: cardId },
      select: { id: true, projectId: true, type: true },
    });

    if (
      !existingCard ||
      existingCard.projectId !== projectId ||
      existingCard.type !== RESOURCE_TYPE_CONTEXT_CARD
    ) {
      redirectWithContextError(projectId, "context-card-not-found");
    }

    await prisma.resource.delete({
      where: { id: cardId },
    });
  } catch (error) {
    console.error("[deleteContextCardAction]", error);
    redirectWithContextError(projectId, "context-delete-failed");
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithContextStatus(projectId, "context-deleted");
}
