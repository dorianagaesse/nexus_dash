import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const REPORT_CONTENT = "Release status report for review.";

async function seedAttachmentTask(userId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("comment-file-attachments"),
      description: "Comment file attachment fixture.",
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  const task = await prisma.task.create({
    data: {
      title: "Comment file attachment fixture",
      description: "<p>Attach review files here.</p>",
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

test.describe("ND-399 comment file attachments", () => {
  test("attaches a file to a comment and serves it back to the author", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedAttachmentTask(userId);

    await page.goto(`/projects/${projectId}#kanban`);
    await page.getByRole("button", { name: new RegExp(taskTitle) }).first().click();

    const composer = page.getByTestId("task-comment-composer");
    const commentInput = composer.locator("#task-comment-input");
    const attachmentTrigger = composer.getByLabel("Add files to comment");

    // The trigger sits inside the comment box and only appears while the input
    // holds focus.
    await commentInput.evaluate((element) => (element as HTMLElement).blur());
    await expect(attachmentTrigger).toHaveCSS("opacity", "0");
    await expect(attachmentTrigger).toHaveCSS("pointer-events", "none");

    await commentInput.click();
    await expect(attachmentTrigger).toHaveCSS("opacity", "1");
    await expect(attachmentTrigger).toHaveCSS("pointer-events", "auto");

    const triggerBox = await attachmentTrigger.boundingBox();
    expect(triggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.locator("#task-comment-attachment-file").setInputFiles({
      name: "archive.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not an accepted type"),
    });
    await expect(
      page.getByText("Unsupported file type. Use PDF, image, text, CSV, or JSON.")
    ).toBeVisible();
    await expect(composer.getByText("archive.zip")).toHaveCount(0);

    const uploadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/tasks/${taskId}/attachments`) &&
        response.ok()
    );
    await page.locator("#task-comment-attachment-file").setInputFiles({
      name: "status-report.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(REPORT_CONTENT),
    });
    await uploadResponse;

    await expect(composer.getByText("status-report.txt")).toBeVisible();
    const removeButton = composer.getByRole("button", {
      name: "Remove file status-report.txt",
    });
    await expect(removeButton).toBeVisible();
    expect((await removeButton.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect((await removeButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Attached drafts keep the trigger reachable without re-focusing the input.
    await commentInput.evaluate((element) => (element as HTMLElement).blur());
    await expect(attachmentTrigger).toHaveCSS("opacity", "1");

    await commentInput.click();
    await page.keyboard.type("Status report attached.");

    const createComment = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/tasks/${taskId}/comments`) &&
        response.status() === 201
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    await createComment;
    await expect(page.getByText("1 comment", { exact: true })).toBeVisible();

    const postedComment = page
      .locator("article")
      .filter({ hasText: "Status report attached." })
      .last();
    await expect(postedComment.getByText("status-report.txt")).toBeVisible();
    await expect(
      postedComment.getByText(`${Buffer.byteLength(REPORT_CONTENT)} B`)
    ).toBeVisible();

    const downloadLink = postedComment.getByRole("link", { name: "status-report.txt" });
    const downloadHref = await downloadLink.getAttribute("href");
    expect(downloadHref).toContain(`/tasks/${taskId}/attachments/`);
    const downloadResponse = await page.request.get(
      new URL(downloadHref as string, page.url()).toString()
    );
    expect(downloadResponse.ok()).toBeTruthy();
    expect(await downloadResponse.text()).toBe(REPORT_CONTENT);

    await page.reload();
    await page.getByRole("button", { name: new RegExp(taskTitle) }).first().click();
    await expect(
      page.getByRole("link", { name: "status-report.txt" })
    ).toBeVisible();
  });
});
