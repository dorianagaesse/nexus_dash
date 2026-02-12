"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import { TASK_STATUSES } from "@/lib/task-status";

const MIN_TITLE_LENGTH = 2;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function redirectWithError(projectId: string, error: string): never {
  redirect(`/projects/${projectId}?error=${error}`);
}

function redirectWithStatus(projectId: string, status: string): never {
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
