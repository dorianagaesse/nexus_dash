import fs from "fs";
import path from "path";

import { afterAll, describe, expect, it } from "vitest";

import { readAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  createContextAttachmentFromForm,
  createTaskAttachmentFromForm,
  deleteContextAttachmentForProject,
  deleteTaskAttachmentForProject,
  getContextAttachmentDownload,
  getTaskAttachmentDownload,
} from "@/lib/services/project-attachment-service";

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line) || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.join(process.cwd(), ".env"));

const smokeEnabled = process.env.R2_SMOKE === "1";
const requiredVars = [
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const missingVars = requiredVars.filter((key) => !process.env[key]);
const shouldRun = smokeEnabled && missingVars.length === 0;
const describeSmoke = shouldRun ? describe : describe.skip;

describeSmoke("R2 storage smoke", () => {
  let projectId = "";
  let taskId = "";
  let cardId = "";

  afterAll(async () => {
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    }
  });

  it("executes task and context-card file lifecycle against R2", async () => {
    expect(process.env.STORAGE_PROVIDER).toBe("r2");

    const project = await prisma.project.create({
      data: {
        name: "R2 Smoke Project",
        description: "Storage validation",
      },
      select: { id: true },
    });
    projectId = project.id;

    const task = await prisma.task.create({
      data: {
        projectId,
        title: "R2 smoke task",
        status: "Backlog",
      },
      select: { id: true },
    });
    taskId = task.id;

    const card = await prisma.resource.create({
      data: {
        projectId,
        type: RESOURCE_TYPE_CONTEXT_CARD,
        name: "R2 smoke card",
        content: "Storage validation",
      },
      select: { id: true },
    });
    cardId = card.id;

    const taskFile = new File(["task-r2-smoke"], "task-r2-smoke.txt", {
      type: "text/plain",
    });
    const taskFormData = new FormData();
    taskFormData.set("kind", "file");
    taskFormData.set("file", taskFile);

    const taskCreate = await createTaskAttachmentFromForm({
      projectId,
      taskId,
      formData: taskFormData,
    });

    expect(taskCreate.ok).toBe(true);
    if (!taskCreate.ok) {
      throw new Error(taskCreate.error);
    }

    const taskAttachment = await prisma.taskAttachment.findUnique({
      where: { id: taskCreate.data.id },
      select: {
        id: true,
        storageKey: true,
      },
    });

    expect(taskAttachment?.storageKey).toBeTruthy();
    const taskStorageKey = taskAttachment?.storageKey as string;

    const taskDownload = await getTaskAttachmentDownload({
      projectId,
      taskId,
      attachmentId: taskCreate.data.id,
      disposition: "attachment",
    });

    expect(taskDownload.ok).toBe(true);
    if (!taskDownload.ok) {
      throw new Error(taskDownload.error);
    }
    expect(taskDownload.data.mode).toBe("redirect");
    expect(taskDownload.data.redirectUrl).toContain("r2.cloudflarestorage.com");

    const taskDelete = await deleteTaskAttachmentForProject({
      projectId,
      taskId,
      attachmentId: taskCreate.data.id,
    });
    expect(taskDelete.ok).toBe(true);

    const deletedTaskAttachment = await prisma.taskAttachment.findUnique({
      where: { id: taskCreate.data.id },
      select: { id: true },
    });
    expect(deletedTaskAttachment).toBeNull();

    await expect(readAttachmentFile(taskStorageKey)).rejects.toThrow();

    const cardFile = new File(["card-r2-smoke"], "card-r2-smoke.txt", {
      type: "text/plain",
    });
    const cardFormData = new FormData();
    cardFormData.set("kind", "file");
    cardFormData.set("file", cardFile);

    const cardCreate = await createContextAttachmentFromForm({
      projectId,
      cardId,
      formData: cardFormData,
    });

    expect(cardCreate.ok).toBe(true);
    if (!cardCreate.ok) {
      throw new Error(cardCreate.error);
    }

    const cardAttachment = await prisma.resourceAttachment.findUnique({
      where: { id: cardCreate.data.id },
      select: {
        id: true,
        storageKey: true,
      },
    });

    expect(cardAttachment?.storageKey).toBeTruthy();
    const cardStorageKey = cardAttachment?.storageKey as string;

    const cardDownload = await getContextAttachmentDownload({
      projectId,
      cardId,
      attachmentId: cardCreate.data.id,
      disposition: "attachment",
    });

    expect(cardDownload.ok).toBe(true);
    if (!cardDownload.ok) {
      throw new Error(cardDownload.error);
    }
    expect(cardDownload.data.mode).toBe("redirect");
    expect(cardDownload.data.redirectUrl).toContain("r2.cloudflarestorage.com");

    const cardDelete = await deleteContextAttachmentForProject({
      projectId,
      cardId,
      attachmentId: cardCreate.data.id,
    });
    expect(cardDelete.ok).toBe(true);

    const deletedCardAttachment = await prisma.resourceAttachment.findUnique({
      where: { id: cardCreate.data.id },
      select: { id: true },
    });
    expect(deletedCardAttachment).toBeNull();

    await expect(readAttachmentFile(cardStorageKey)).rejects.toThrow();
  });
});

if (!shouldRun) {
  // Keep reason visible in logs when the smoke is skipped.
  // eslint-disable-next-line no-console
  console.log(
    `[r2-smoke] skipped (R2_SMOKE=${process.env.R2_SMOKE ?? "unset"}, missing=${missingVars.join(",") || "none"})`
  );
}
