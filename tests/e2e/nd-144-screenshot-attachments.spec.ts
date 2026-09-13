import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function seedScreenshotTask(userId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("screenshot-attachments"),
      description: "Screenshot attachment fixture.",
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  const task = await prisma.task.create({
    data: {
      title: "Screenshot evidence fixture",
      description: "<p>Attach visual evidence here.</p>",
      status: "Backlog",
      position: 0,
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: { id: true, title: true },
  });
  return { projectId: project.id, taskId: task.id, taskTitle: task.title };
}

test.describe("ND-144 screenshot attachments", () => {
  test("uploads to a description and pastes an inline comment screenshot on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedScreenshotTask(userId);

    await page.goto(`/projects/${projectId}#kanban`);
    await page.getByRole("button", { name: new RegExp(taskTitle) }).first().click();
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const descriptionUpload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/tasks/${taskId}/attachments`) &&
        response.ok()
    );
    await page.locator("#task-edit-attachment-file").setInputFiles({
      name: "description-evidence.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_BASE64, "base64"),
    });
    await descriptionUpload;
    await expect(
      page.getByRole("button", {
        name: "Preview screenshot description-evidence.png",
      })
    ).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();

    const commentInput = page.getByLabel("Task comment");
    const commentUpload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/tasks/${taskId}/attachments`) &&
        response.ok()
    );
    await commentInput.evaluate((element, pngBase64) => {
      const bytes = Uint8Array.from(atob(pngBase64), (character) =>
        character.charCodeAt(0)
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "comment-paste.png", { type: "image/png" })
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        })
      );
    }, PNG_BASE64);
    await commentUpload;

    const draftPreview = page.getByRole("button", {
      name: "Preview screenshot comment-paste.png",
    });
    await expect(draftPreview).toBeVisible();
    const commentComposer = page.getByTestId("task-comment-composer");
    await expect(commentComposer.locator("#task-comment-input")).toBeVisible();
    await expect(commentComposer.getByRole("button", {
      name: "Preview screenshot comment-paste.png",
    })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bold" })).toHaveCount(0);
    const uploadButton = page.getByLabel("Upload screenshots to comment");
    expect((await uploadButton.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect((await uploadButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const createComment = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/tasks/${taskId}/comments`) &&
        response.status() === 201
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    await createComment;
    await expect(page.getByText("1 comment", { exact: true })).toBeVisible();
    await expect(draftPreview).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: new RegExp(taskTitle) }).first().click();
    await expect(
      page.getByRole("button", { name: "Preview screenshot comment-paste.png" })
    ).toBeVisible();
    await expect(page.locator("[role='dialog']")).toHaveCSS("overflow-x", "hidden");
  });
});
