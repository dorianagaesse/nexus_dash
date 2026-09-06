import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function seedFixtureTask(
  userId: string,
  description: string | null
): Promise<{ projectId: string; taskId: string; taskTitle: string }> {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd379-shortcut"),
      description: "Markdown list shortcut coverage.",
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
      title: "List shortcut fixture task",
      description,
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

async function openTaskEditor(
  page: import("@playwright/test").Page,
  projectId: string,
  taskTitle: string,
  taskId: string
): Promise<import("@playwright/test").Locator> {
  await page.goto(`/projects/${projectId}#kanban`);
  await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();

  const taskCard = page
    .getByRole("button", { name: new RegExp(taskTitle) })
    .first();
  await expect(taskCard).toBeVisible();
  await taskCard.click();

  await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  return page.locator(`#task-description-editor-${taskId}`);
}

test.describe("ND-379 rich-text markdown shortcuts", () => {
  test("converts '- ' into a bulleted list, keeps native list editing, and persists it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedFixtureTask(userId, null);

    const editor = await openTaskEditor(page, projectId, taskTitle, taskId);
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("- First item");
    await expect(editor.locator("ul li")).toHaveCount(1);
    await expect(editor.locator("ul li")).toContainText("First item");

    // Native list editing continues to work after the conversion.
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second item");
    await expect(editor.locator("ul li")).toHaveCount(2);
    await expect(editor.locator("ul li").nth(1)).toContainText("Second item");

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();

    const persisted = await prisma.task.findUnique({
      where: { id: taskId },
      select: { description: true },
    });
    expect(persisted?.description).toBe(
      "<ul><li>First item</li><li>Second item</li></ul>"
    );

    // Re-open the task: the saved description renders as a bulleted list.
    await page.reload();
    await page.goto(`/projects/${projectId}#kanban`);
    const taskCard = page
      .getByRole("button", { name: new RegExp(taskTitle) })
      .first();
    await taskCard.click();
    const renderedList = page.getByRole("dialog").locator("ul li");
    await expect(renderedList).toHaveCount(2);
    await expect(renderedList).toContainText(["First item", "Second item"]);
  });

  test("converts the whole line when '* ' is typed before existing paragraph text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId, taskTitle } = await seedFixtureTask(
      userId,
      "<p>Existing plan text</p>"
    );

    const editor = await openTaskEditor(page, projectId, taskTitle, taskId);
    const paragraph = editor.locator("p");
    await expect(paragraph).toContainText("Existing plan text");

    await paragraph.click();
    await page.keyboard.press("Home");
    await page.keyboard.type("* ");
    await expect(editor.locator("ul li")).toContainText("Existing plan text");
    await expect(editor.locator("p")).toHaveCount(0);

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();

    const persisted = await prisma.task.findUnique({
      where: { id: taskId },
      select: { description: true },
    });
    expect(persisted?.description).toBe(
      "<ul><li>Existing plan text</li></ul>"
    );
  });
});
