import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test.describe("ND-464 titled rich-content links", () => {
  test("renders accessible titled links across task, comment, and context-card content", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const userId = await signInAsVerifiedUser(page);
    const project = await prisma.project.create({
      data: {
        name: uniqueProjectName("nd464-links"),
        description: "Titled links fixture.",
        ownerId: userId,
        memberships: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    const task = await prisma.task.create({
      data: {
        title: "Review titled links",
        description:
          "<p>Read https://nexus-dash.app/ for the task.</p>",
        status: "Backlog",
        position: 0,
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        comments: {
          create: {
            authorUserId: userId,
            content:
              "<p>Check https://mail.google.com/ for the comment.</p>",
          },
        },
      },
      select: { id: true },
    });
    await prisma.resource.create({
      data: {
        type: "context-card",
        name: "Link reference",
        content:
          "<p>Open https://example.com/context/very-long-path for context.</p>",
        projectId: project.id,
        createdByUserId: userId,
      },
    });

    await page.goto(`/projects/${project.id}/tasks/${task.id}`);
    const taskLink = page.getByRole("link", { name: "Nexus Dash" });
    const commentLink = page.getByRole("link", { name: "Google Mail" });
    await expect(taskLink).toBeVisible();
    await expect(commentLink).toBeVisible();
    await expect(taskLink).toHaveAttribute("href", "https://nexus-dash.app/");
    await expect(taskLink).toHaveAttribute("target", "_blank");
    await taskLink.focus();
    await expect(taskLink).toBeFocused();

    await page.goto(`/projects/${project.id}#context`);
    await page.getByRole("button", { name: /Project context/ }).click();
    const contextLink = page.getByRole("link", { name: "Example" });
    await expect(contextLink).toBeVisible();
    await expect(contextLink).toHaveAttribute(
      "href",
      "https://example.com/context/very-long-path"
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    );
  });

  test("keeps a typed inline URL in the sentence around it with no paragraph breaks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const project = await prisma.project.create({
      data: {
        name: uniqueProjectName("nd464-inline-links"),
        description: "Inline link fixture.",
        ownerId: userId,
        memberships: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    const task = await prisma.task.create({
      data: {
        title: "Typed inline link",
        description: null,
        status: "Backlog",
        position: 0,
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      select: { id: true, title: true },
    });

    await page.goto(`/projects/${project.id}#kanban`);
    const taskCard = page
      .getByRole("button", { name: new RegExp(task.title) })
      .first();
    await expect(taskCard).toBeVisible();
    await taskCard.click();
    await expect(
      page.getByRole("button", { name: "Task options" })
    ).toBeVisible();

    const commentInput = page.locator("#task-comment-input");
    await commentInput.click();
    await page.keyboard.type("XXX https://mail.google.com YYY");
    await expect(commentInput.locator("a")).toHaveText("Google Mail");

    const commentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/comments") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    expect((await commentResponsePromise).status()).toBe(201);

    const comment = await prisma.taskComment.findFirstOrThrow({
      where: { taskId: task.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true },
    });
    // Chrome's contentEditable emits a non-breaking space for a typed space
    // directly after an inline link, so match any whitespace there.
    expect(comment.content).toMatch(
      /^<p>XXX <a\b[^>]*href="https:\/\/mail\.google\.com\/?"[^>]*>Google Mail<\/a>\sYYY<\/p>$/
    );

    const commentBody = page.locator(`#task-comment-body-${comment.id}`);
    await expect(commentBody).toBeVisible();
    await expect(commentBody.locator("p")).toHaveCount(1);
    await expect(commentBody).toContainText("XXX Google Mail YYY");
    await expect(commentBody.locator("p a")).toHaveText("Google Mail");
  });
});
