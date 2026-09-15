import { expect, test, type Page } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  uniqueProjectName,
} from "./helpers/project-helpers";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function openDialog(page: Page) {
  return page.locator('[role="dialog"][data-state="open"]').first();
}

function modalButton(page: Page, name: string) {
  return openDialog(page).getByRole("button", { name, exact: true });
}

async function openProjectDashboardByUrl(page: Page, projectName: string) {
  await page.goto("/projects");
  const link = page
    .locator("div,article,section,li")
    .filter({ hasText: projectName })
    .locator('a[href^="/projects/"]')
    .first();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href as string);
  await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();
}

async function setupProject(page: Page, suffix: string) {
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName(`nd465-${suffix}`);
  await createProjectFromProjectsPage(page, projectName);
  await openProjectDashboardByUrl(page, projectName);
  return projectName;
}

async function createTask(page: Page, title: string) {
  await page.getByRole("button", { name: "New task" }).first().click();
  await openDialog(page).getByLabel("Title").fill(title);
  await modalButton(page, "Create task").click();
  const card = page.locator("[data-kanban-task-card]").first();
  await expect(card).toBeVisible();
  // The optimistic card swaps to the persisted task id once creation settles.
  await expect
    .poll(() => card.getAttribute("data-kanban-task-card"))
    .not.toContain("optimistic-task-");
  return card;
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(openDialog(page).getByLabel("Task title")).toBeVisible();
}

async function expectFocusOnCard(page: Page, taskId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (document.activeElement as HTMLElement | null)?.getAttribute(
            "data-kanban-task-card"
          ) ?? null
      )
    )
    .toBe(taskId);
}

test.describe("ND-465 Kanban task Cancel", () => {
  test("create flow Cancel closes the dialog, discards the draft, and returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupProject(page, "create");

    const newTaskButton = page.getByRole("button", { name: "New task" }).first();
    await newTaskButton.click();
    await openDialog(page).getByLabel("Title").fill("nd465 draft that must be discarded");
    await openDialog(page).getByLabel("Labels").fill("nd465-draft-label");

    await modalButton(page, "Cancel").click();

    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    // The New task button is the Radix trigger, so focus returns to it.
    await expect(newTaskButton).toBeFocused();

    await newTaskButton.click();
    await expect(openDialog(page).getByLabel("Title")).toHaveValue("");
    await expect(openDialog(page).getByLabel("Labels")).toHaveValue("");
    await expect(modalButton(page, "Cancel")).toBeEnabled();
    await modalButton(page, "Cancel").click();
    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
  });

  test("edit flow Cancel closes the task UI without persisting edits and returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupProject(page, "edit");

    const card = await createTask(page, "nd465 edit cancel target");
    const taskId = (await card.getAttribute("data-kanban-task-card")) as string;
    await card.click();
    await enterEditMode(page);
    await openDialog(page).getByLabel("Task title").fill("nd465 title that must not persist");

    await modalButton(page, "Cancel").click();

    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    await expectFocusOnCard(page, taskId);

    await page.reload();
    const reloadedCard = page.locator(`[data-kanban-task-card="${taskId}"]`);
    await expect(reloadedCard).toBeVisible();
    await expect(reloadedCard).toContainText("nd465 edit cancel target");
    await expect(reloadedCard).not.toContainText("must not persist");
  });

  test("Cancel is reachable by keyboard activation in create and edit flows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupProject(page, "keyboard");

    const newTaskButton = page.getByRole("button", { name: "New task" }).first();
    await newTaskButton.click();
    await openDialog(page).getByLabel("Title").fill("nd465 keyboard create draft");
    await modalButton(page, "Cancel").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    await expect(newTaskButton).toBeFocused();

    const card = await createTask(page, "nd465 keyboard cancel target");
    const taskId = (await card.getAttribute("data-kanban-task-card")) as string;
    await card.click();
    await enterEditMode(page);

    const cancelButton = modalButton(page, "Cancel");
    await cancelButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    await expectFocusOnCard(page, taskId);
  });

  test("view mode exposes a single Close control and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupProject(page, "close");

    const card = await createTask(page, "nd465 close target");
    const taskId = (await card.getAttribute("data-kanban-task-card")) as string;
    await card.click();
    await expect(openDialog(page).getByRole("button", { name: "Task options" })).toBeVisible();

    await expect(modalButton(page, "Cancel")).toHaveCount(0);
    await modalButton(page, "Close").click();

    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
    await expectFocusOnCard(page, taskId);
  });

  test("mobile sheet Cancel closes the task UI on tap in create and edit flows", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();

    try {
      await setupProject(page, "mobile");

      const newTaskButton = page.getByRole("button", { name: "New task" }).first();
      await newTaskButton.tap();
      await openDialog(page)
        .getByLabel("Title")
        .fill("nd465 mobile create draft that must be discarded");
      await modalButton(page, "Cancel").tap();
      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
      await expect(newTaskButton).toBeFocused();
      await newTaskButton.tap();
      await expect(openDialog(page).getByLabel("Title")).toHaveValue("");
      await modalButton(page, "Cancel").tap();
      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);

      const card = await createTask(page, "nd465 mobile cancel target");
      const taskId = (await card.getAttribute("data-kanban-task-card")) as string;
      await card.tap();
      await enterEditMode(page);
      await openDialog(page).getByLabel("Task title").fill("nd465 mobile edit discarded");

      await modalButton(page, "Cancel").tap();

      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
      await expectFocusOnCard(page, taskId);
    } finally {
      await context.close();
    }
  });
});
