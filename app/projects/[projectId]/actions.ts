"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CONTEXT_CARD_COLORS,
  isContextCardColor,
} from "@/lib/context-card-colors";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { sanitizeRichText } from "@/lib/rich-text";
import { TASK_STATUSES } from "@/lib/task-status";

const MIN_TITLE_LENGTH = 2;
const MAX_CONTEXT_TITLE_LENGTH = 120;
const MAX_CONTEXT_CONTENT_LENGTH = 4000;

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
  const label = readText(formData, "label");
  const status = TASK_STATUSES[0];

  if (title.length < MIN_TITLE_LENGTH) {
    redirectWithError(projectId, "title-too-short");
  }

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

    await prisma.task.create({
      data: {
        projectId,
        title,
        description,
        label: label.length > 0 ? label : null,
        status,
        position: nextPosition,
      },
    });
  } catch (error) {
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

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      redirectWithContextError(projectId, "project-not-found");
    }

    await prisma.resource.create({
      data: {
        projectId,
        type: RESOURCE_TYPE_CONTEXT_CARD,
        name: title,
        content,
        color,
      },
    });
  } catch (error) {
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
