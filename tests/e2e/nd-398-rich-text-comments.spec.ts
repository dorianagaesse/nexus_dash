import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function seedProjectWithTask(userId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd398-rich-comments"),
      description: "Rich text comment fixture.",
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });

  const task = await prisma.task.create({
    data: {
      title: "Rich text comment fixture task",
      description: null,
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

async function openTaskModal(
  page: import("@playwright/test").Page,
  projectId: string,
  taskTitle: string
) {
  await page.goto(`/projects/${projectId}#kanban`);
  await expect(
    page.getByRole("heading", { name: "Kanban board" })
  ).toBeVisible();

  const taskCard = page
    .getByRole("button", { name: new RegExp(taskTitle) })
    .first();
  await expect(taskCard).toBeVisible();
  await taskCard.click();
  await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
}

test.describe("ND-398 rich text in task comments", () => {
  test("round-trips rich formatting from the comment composer into stored HTML and renders it back", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedProjectWithTask(userId);

    await openTaskModal(page, projectId, taskTitle);

    const commentInput = page.locator("#task-comment-input");
    await commentInput.click();
    await page.keyboard.type("Follow up:");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- Confirm rollout order");
    await expect(commentInput.locator("ul li")).toContainText(
      "Confirm rollout order"
    );

    const commentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/comments") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    const commentResponse = await commentResponsePromise;
    expect(commentResponse.status()).toBe(201);

    const comment = await prisma.taskComment.findFirstOrThrow({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true },
    });
    expect(comment.content).toContain("<p>Follow up:</p>");
    expect(comment.content).toContain("<ul><li>Confirm rollout order</li></ul>");

    const commentBody = page.locator(`#task-comment-body-${comment.id}`);
    await expect(commentBody).toBeVisible();
    await expect(commentBody).toContainText("Follow up:");
    await expect(commentBody.locator("ul li")).toContainText(
      "Confirm rollout order"
    );
    await expect(commentBody).not.toContainText("<ul>");
  });

  test("keeps legacy plain-text comments readable and never renders unsafe markup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedProjectWithTask(userId);

    const plainComment = await prisma.taskComment.create({
      data: {
        taskId,
        authorUserId: userId,
        content: "Legacy plain comment.",
      },
      select: { id: true },
    });
    const unsafeComment = await prisma.taskComment.create({
      data: {
        taskId,
        authorUserId: userId,
        content:
          '<p>Legacy with <script>window.__ndPwned = 1;</script>inline script</p><img src="x" onerror="window.__ndPwned = 2">',
      },
      select: { id: true },
    });

    await openTaskModal(page, projectId, taskTitle);

    const plainBody = page.locator(`#task-comment-body-${plainComment.id}`);
    await expect(plainBody).toBeVisible();
    await expect(plainBody).toContainText("Legacy plain comment.");

    const unsafeBody = page.locator(`#task-comment-body-${unsafeComment.id}`);
    await expect(unsafeBody).toBeVisible();
    await expect(unsafeBody).toContainText("Legacy with inline script");
    await expect(unsafeBody.locator("script, img")).toHaveCount(0);

    const pwned = await page.evaluate(
      () => (window as { __ndPwned?: number }).__ndPwned
    );
    expect(pwned).toBeUndefined();

    // The composer uses the approved rich-text authoring model.
    await expect(page.getByRole("button", { name: "Bold" })).toBeVisible();
  });
});
