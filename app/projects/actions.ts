"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const PROJECTS_PATH = "/projects";
const MIN_NAME_LENGTH = 2;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function redirectWithStatus(status: string): never {
  redirect(`${PROJECTS_PATH}?status=${status}`);
}

function redirectWithError(error: string): never {
  redirect(`${PROJECTS_PATH}?error=${error}`);
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const name = readText(formData, "name");
  const descriptionText = readText(formData, "description");

  if (name.length < MIN_NAME_LENGTH) {
    redirectWithError("name-too-short");
  }

  try {
    await prisma.project.create({
      data: {
        name,
        description: descriptionText.length > 0 ? descriptionText : null,
      },
    });
  } catch (error) {
    console.error("[createProjectAction]", error);
    redirectWithError("create-failed");
  }

  revalidatePath(PROJECTS_PATH);
  redirectWithStatus("created");
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const projectId = readText(formData, "projectId");
  const name = readText(formData, "name");
  const descriptionText = readText(formData, "description");

  if (!projectId) {
    redirectWithError("missing-project-id");
  }

  if (name.length < MIN_NAME_LENGTH) {
    redirectWithError("name-too-short");
  }

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        description: descriptionText.length > 0 ? descriptionText : null,
      },
    });
  } catch (error) {
    console.error("[updateProjectAction]", error);
    redirectWithError("update-failed");
  }

  revalidatePath(PROJECTS_PATH);
  redirectWithStatus("updated");
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const projectId = readText(formData, "projectId");

  if (!projectId) {
    redirectWithError("missing-project-id");
  }

  try {
    await prisma.project.delete({
      where: { id: projectId },
    });
  } catch (error) {
    console.error("[deleteProjectAction]", error);
    redirectWithError("delete-failed");
  }

  revalidatePath(PROJECTS_PATH);
  redirectWithStatus("deleted");
}
