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
          "<p>Read the [task guide](https://example.com/task/very-long-path).</p>",
        status: "Backlog",
        position: 0,
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        comments: {
          create: {
            authorUserId: userId,
            content:
              "<p>Check the [comment source](https://example.com/comment/very-long-path).</p>",
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
          "<p>Open the [context source](https://example.com/context/very-long-path).</p>",
        projectId: project.id,
        createdByUserId: userId,
      },
    });

    await page.goto(`/projects/${project.id}/tasks/${task.id}`);
    const taskLink = page.getByRole("link", { name: "task guide" });
    const commentLink = page.getByRole("link", { name: "comment source" });
    await expect(taskLink).toBeVisible();
    await expect(commentLink).toBeVisible();
    await expect(taskLink).toHaveAttribute("href", "https://example.com/task/very-long-path");
    await expect(taskLink).toHaveAttribute("target", "_blank");
    await taskLink.focus();
    await expect(taskLink).toBeFocused();

    await page.goto(`/projects/${project.id}#context`);
    await page.getByRole("button", { name: /Project context/ }).click();
    const contextLink = page.getByRole("link", { name: "context source" });
    await expect(contextLink).toBeVisible();
    await expect(contextLink).toHaveAttribute(
      "href",
      "https://example.com/context/very-long-path"
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    );
  });
});
