import { expect, test, type Locator, type Page } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  uniqueProjectName,
} from "./helpers/project-helpers";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TRANSPARENT = "rgba(0, 0, 0, 0)";

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

async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem("nexusdash-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
}

function relativeLuminance(color: string) {
  const match = color.match(/rgba?\(([^)]+)\)/i);
  expect(match, `expected an rgb color, received "${color}"`).not.toBeNull();

  const [r, g, b] = match![1]
    .split(",")
    .slice(0, 3)
    .map((channel) => {
      const normalized = Number.parseFloat(channel) / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readControlStyles(locator: Locator) {
  return locator.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      text: styles.color,
      borderTopWidth: styles.borderTopWidth,
      borderTopColor: styles.borderTopColor,
    };
  });
}

function isDark(color: string) {
  return relativeLuminance(color) < 0.1;
}

// The buttons animate their colors, so the settled fill is polled rather than
// sampled once right after a theme or hover change.
function expectSettledControl(locator: Locator) {
  return expect.poll(async () => {
    const { background, text } = await readControlStyles(locator);
    return {
      background:
        background === TRANSPARENT
          ? "transparent"
          : isDark(background)
            ? "dark"
            : "light",
      text: isDark(text) ? "dark" : "light",
    };
  });
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

  test("Close and Cancel affordances invert with the theme", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupProject(page, "theme");
    await applyTheme(page, "light");

    // The create dialog's Cancel uses the same outlined dismissal treatment.
    await page.getByRole("button", { name: "New task" }).first().click();
    const createCancel = modalButton(page, "Cancel");
    await expect(createCancel).toBeVisible();
    const createCancelStyles = await readControlStyles(createCancel);
    expect(createCancelStyles.background).toBe(TRANSPARENT);
    expect(createCancelStyles.borderTopWidth).toBe("1px");
    await createCancel.click();
    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);

    const card = await createTask(page, "nd465 theme inversion target");
    await card.click();

    const closeBar = modalButton(page, "Close");
    await expect(closeBar).toBeVisible();
    await expect(modalButton(page, "Cancel")).toHaveCount(0);

    // The view-mode dismissal is a full-bleed bar across the dialog footer.
    const dialogBox = await openDialog(page).boundingBox();
    const barBox = await closeBar.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect(barBox!.width / dialogBox!.width).toBeGreaterThan(0.98);

    for (const theme of ["light", "dark"] as const) {
      await applyTheme(page, theme);

      // Dark bar with a light label in the light theme, and the reverse in
      // the dark theme.
      await expectSettledControl(closeBar).toEqual({
        background: theme === "light" ? "dark" : "light",
        text: theme === "light" ? "light" : "dark",
      });
    }

    await applyTheme(page, "light");
    await enterEditMode(page);
    const cancel = modalButton(page, "Cancel");
    await expect(cancel).toBeVisible();

    // Cancel is an outline, so the filled primary action beside it stays the
    // only solid button in the row.
    const saveStyles = await readControlStyles(modalButton(page, "Save changes"));
    expect(isDark(saveStyles.background)).toBe(true);

    for (const theme of ["light", "dark"] as const) {
      await applyTheme(page, theme);
      // Park the pointer so the idle fill is measured, not the hover fill.
      await page.mouse.move(2, 2);

      // Idle: unfilled outline with the theme's foreground label and a
      // visible border.
      await expectSettledControl(cancel).toEqual({
        background: "transparent",
        text: theme === "light" ? "dark" : "light",
      });

      const idle = await readControlStyles(cancel);
      expect(idle.borderTopWidth).toBe("1px");
      expect(idle.borderTopColor).not.toBe(TRANSPARENT);

      // Hover: fills with the same inverted surface as the Close bar.
      await cancel.hover();
      await expectSettledControl(cancel).toEqual({
        background: theme === "light" ? "dark" : "light",
        text: theme === "light" ? "light" : "dark",
      });
    }
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
