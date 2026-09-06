import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const LONG_COMMENT_CONTENT = [
  "This comment is deliberately long so it overflows the collapsed cap:",
  "",
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "",
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
].join("\n");

async function seedTaskWithComments(userId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("comment-constraint"),
      description: "Comment expand/collapse fixture.",
      ownerId: userId,
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });

  const task = await prisma.task.create({
    data: {
      title: "Comment constraint fixture task",
      description: null,
      status: "Backlog",
      position: 0,
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: { id: true, title: true },
  });

  const longComment = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorUserId: userId,
      content: LONG_COMMENT_CONTENT,
    },
    select: { id: true },
  });

  const shortComment = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorUserId: userId,
      content: "Short comment stays fully visible.",
    },
    select: { id: true },
  });

  return {
    projectId: project.id,
    taskTitle: task.title,
    longCommentId: longComment.id,
    shortCommentId: shortComment.id,
  };
}

test.describe("ND-397 comment expand/collapse", () => {
  test("caps overflowing comments and toggles them with the keyboard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskTitle, longCommentId, shortCommentId } =
      await seedTaskWithComments(userId);

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

    const longBody = page.locator(`#task-comment-body-${longCommentId}`);
    const shortBody = page.locator(`#task-comment-body-${shortCommentId}`);
    await expect(longBody).toBeVisible();
    await expect(shortBody).toBeVisible();

    // The toggle's accessible name is scoped to the comment author's identity
    // (displayName = username for seeded users), so match it generically and
    // pin the control to the long comment via aria-controls below.
    const togglePattern = /^(Show more|Show less) of .+'s comment$/;
    const toggle = page.getByRole("button", { name: togglePattern });

    // Only the overflowing comment gets a toggle; the short one stays bare.
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("Show more");
    await expect(toggle).toHaveAttribute(
      "aria-controls",
      `task-comment-body-${longCommentId}`
    );

    // Collapsed body sits at the shared cap (6 x 1.25rem at a 16px root = 120px).
    await expect
      .poll(() => longBody.boundingBox()?.height ?? 0)
      .toBeLessThanOrEqual(121);
    const collapsedHeight = await longBody.boundingBox();
    expect(await longBody.evaluate((element) => element.style.maxHeight)).toBe(
      "7.5rem"
    );

    // Short comment article has no toggle and is not capped.
    const shortArticle = shortBody.locator("xpath=ancestor::article");
    await expect(
      shortArticle.getByRole("button", { name: togglePattern })
    ).toHaveCount(0);
    expect(await shortBody.evaluate((element) => element.style.maxHeight)).toBe(
      ""
    );

    // Keyboard: focus the toggle and press Enter to reveal the full comment.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText("Show less");
    const expandedHeight = await longBody.boundingBox();
    expect(expandedHeight?.height ?? 0).toBeGreaterThan(
      collapsedHeight?.height ?? 0
    );

    // Press Enter again to restore the collapsed state.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("Show more");
    await expect
      .poll(() => longBody.boundingBox()?.height ?? 0)
      .toBeLessThanOrEqual(121);
  });
});
