import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

function openDialog(page: Page) {
  return page.locator('[role="dialog"][data-state="open"]').first();
}

function modalButton(page: Page, name: string) {
  return openDialog(page).getByRole("button", { name, exact: true });
}

function scrollContainer(page: Page) {
  return openDialog(page).locator(".overflow-y-auto").first();
}

function longDescription(paragraphs: number) {
  return Array.from(
    { length: paragraphs },
    (_, index) =>
      `<p>Paragraph ${index + 1}: ${"read surface filler copy ".repeat(12)}</p>`
  ).join("");
}

async function ensureBoardExpanded(page: Page) {
  const headerToggle = page.getByRole("button", { name: /Kanban board/ });
  if ((await headerToggle.getAttribute("aria-expanded")) === "false") {
    await headerToggle.click();
  }
  await expect(page.getByRole("searchbox", { name: "Search tasks" })).toBeVisible();
}

async function waitForDialogAnimations(page: Page) {
  await expect
    .poll(() =>
      openDialog(page).evaluate((dialog) =>
        dialog
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState !== "running")
      )
    )
    .toBe(true);
}

interface SetupOptions {
  description?: string;
  relatedTaskTitle?: string;
}

async function setupProjectWithTask(page: Page, suffix: string, options: SetupOptions = {}) {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName(`nd122-${suffix}`),
      description: "Task modal read/edit coverage",
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
      title: uniqueProjectName(`nd122-${suffix}-target`),
      projectId: project.id,
      status: "Backlog",
      position: 0,
      createdByUserId: userId,
      updatedByUserId: userId,
      description: options.description ?? null,
    },
    select: { id: true, title: true },
  });

  let relatedTask: { id: string; title: string } | null = null;
  if (options.relatedTaskTitle) {
    relatedTask = await prisma.task.create({
      data: {
        title: uniqueProjectName(options.relatedTaskTitle),
        projectId: project.id,
        status: "Backlog",
        position: 1,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      select: { id: true, title: true },
    });
    // The app stores one row per relation and reads it bilaterally.
    await prisma.taskRelation.create({
      data: {
        leftTaskId: task.id,
        rightTaskId: relatedTask.id,
        projectId: project.id,
      },
    });
  }

  return { project, task, relatedTask };
}

async function openTaskModal(page: Page, projectId: string, taskId: string) {
  await page.goto(`/projects/${projectId}`);
  await ensureBoardExpanded(page);
  await page.locator(`[data-kanban-task-id="${taskId}"]`).click();
  await expect(openDialog(page).getByRole("button", { name: "Task options" })).toBeVisible();
  await waitForDialogAnimations(page);
}

test.describe("ND-122 task modal read/edit separation", () => {
  test("entering edit mode focuses the title and resets the reading position to the top", async ({
    page,
  }) => {
    const { project, task } = await setupProjectWithTask(page, "entry", {
      description: longDescription(10),
    });
    await openTaskModal(page, project.id, task.id);

    const dialog = openDialog(page);
    const scroller = scrollContainer(page);
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await modalButton(page, "Edit task").click();

    const titleField = dialog.getByLabel("Task title");
    await expect(titleField).toBeVisible();
    await expect(titleField).toBeFocused();
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("keeps edit mode with a Saving state until the PATCH settles, then returns to read mode", async ({
    page,
  }) => {
    const { project, task } = await setupProjectWithTask(page, "save");
    await openTaskModal(page, project.id, task.id);

    const dialog = openDialog(page);
    await expect(modalButton(page, "Edit task")).toBeVisible();
    await modalButton(page, "Edit task").click();
    await expect(modalButton(page, "Cancel")).toBeVisible();
    await expect(modalButton(page, "Edit task")).toHaveCount(0);

    const updatedTitle = `${task.title} saved`;
    let releasePatch!: () => void;
    const patchGate = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    await page.route("**/api/projects/**/tasks/**", async (route) => {
      if (route.request().method() === "PATCH") {
        await patchGate;
      }
      await route.continue();
    });

    const titleField = dialog.getByLabel("Task title");
    await titleField.fill(updatedTitle);
    await modalButton(page, "Save changes").click();

    // Mid-flight: the edit surface and the Saving primary stay on screen.
    await expect(titleField).toBeVisible();
    const savingButton = dialog.getByRole("button", {
      name: "Saving changes...",
      exact: true,
    });
    await expect(savingButton).toBeVisible();
    await expect(savingButton).toBeDisabled();
    await expect(modalButton(page, "Close")).toHaveCount(0);
    await expect(modalButton(page, "Cancel")).toBeVisible();

    releasePatch();
    await expect(page.getByText("Task saved.")).toBeVisible();
    await expect(titleField).toHaveCount(0);
    await expect(dialog.locator("h3").first()).toHaveText(updatedTitle);
    await expect(modalButton(page, "Close")).toBeVisible();
    await page.unroute("**/api/projects/**/tasks/**");
  });

  test("a failed save keeps edit mode with the error surfaced and the draft intact", async ({
    page,
  }) => {
    const { project, task } = await setupProjectWithTask(page, "failure");
    await openTaskModal(page, project.id, task.id);

    const dialog = openDialog(page);
    await modalButton(page, "Edit task").click();
    const titleField = dialog.getByLabel("Task title");
    const attemptedTitle = `${task.title} unsaved`;
    await titleField.fill(attemptedTitle);

    await page.route("**/api/projects/**/tasks/**", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "server exploded" }),
        });
        return;
      }
      await route.continue();
    });

    await modalButton(page, "Save changes").click();

    await expect(page.getByText("Could not save task changes. Please retry.")).toBeVisible();
    await expect(titleField).toBeVisible();
    await expect(titleField).toHaveValue(attemptedTitle);
    await expect(modalButton(page, "Save changes")).toBeEnabled();
    await expect(modalButton(page, "Close")).toHaveCount(0);

    await modalButton(page, "Cancel").click();
    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    await page.unroute("**/api/projects/**/tasks/**");
  });

  test("switching to a related task inside the modal resets the reading position", async ({
    page,
  }) => {
    const { project, task, relatedTask } = await setupProjectWithTask(page, "related", {
      description: longDescription(10),
      relatedTaskTitle: "nd122-related-destination",
    });
    await openTaskModal(page, project.id, task.id);

    const dialog = openDialog(page);
    const scroller = scrollContainer(page);
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await dialog
      .getByRole("button", { name: relatedTask!.title, exact: true })
      .click();

    await expect(dialog.locator("h3").first()).toHaveText(relatedTask!.title);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  });
});
