import { expect, test, type Locator, type Page } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  uniqueProjectName,
} from "./helpers/project-helpers";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TRANSPARENT = "rgba(0, 0, 0, 0)";
// Tailwind `px-6` and `gap-2` on the redesigned footer rows.
const FOOTER_PADDING = 24;
const ROW_GAP = 8;
// Shadcn Button base `rounded-md`, i.e. calc(var(--radius) - 2px) at 0.75rem.
const BUTTON_RADIUS = "10px";

function openDialog(page: Page) {
  return page.locator('[role="dialog"][data-state="open"]').first();
}

function modalButton(page: Page, name: string) {
  return openDialog(page).getByRole("button", { name, exact: true });
}

function footer(page: Page) {
  return openDialog(page)
    .locator('[data-calendar-popover-footer-boundary="true"]')
    .first();
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
  const projectName = uniqueProjectName(`nd484-${suffix}`);
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

// The dialog plays an entrance animation; measuring boxes mid-flight mixes
// scales between reads.
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

async function openTaskModal(page: Page, card: Locator) {
  await card.click();
  await expect(
    openDialog(page).getByRole("button", { name: "Task options" })
  ).toBeVisible();
  await waitForDialogAnimations(page);
}

async function openCreateDialog(page: Page) {
  await page.getByRole("button", { name: "New task" }).first().click();
  await expect(modalButton(page, "Create task")).toBeVisible();
  await waitForDialogAnimations(page);
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(openDialog(page).getByLabel("Task title")).toBeVisible();
}

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
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

function isDark(color: string) {
  return relativeLuminance(color) < 0.1;
}

function readControlStyles(locator: Locator) {
  return locator.evaluate((element) => {
    // Computed colors can surface in modern color spaces (Chrome reports
    // opacity-modifier fills as oklab); painting them onto a canvas normalizes
    // every value to sRGB rgba().
    const canvas = element.ownerDocument.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const toRgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
    };
    const styles = window.getComputedStyle(element);
    return {
      background: toRgb(styles.backgroundColor),
      text: toRgb(styles.color),
      borderTopWidth: styles.borderTopWidth,
      borderLeftWidth: styles.borderLeftWidth,
      borderTopColor: toRgb(styles.borderTopColor),
      borderRadius: styles.borderRadius,
    };
  });
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

// Idle and hover fills sit on the same side of the palette, so the luminance
// poll above cannot tell them apart. Wait for the fill to leave its idle value
// and then for the color transition to finish before sampling.
async function hoverSettledStyles(locator: Locator, idleBackground: string) {
  await expect
    .poll(async () => (await readControlStyles(locator)).background)
    .not.toBe(idleBackground);
  await expect
    .poll(async () => {
      const first = (await readControlStyles(locator)).background;
      await locator.page().waitForTimeout(80);
      const second = (await readControlStyles(locator)).background;
      return first === second;
    })
    .toBe(true);
  return readControlStyles(locator);
}

async function readBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "expected the control to be laid out").not.toBeNull();
  return box!;
}

// A dismissal keeps the footer surface: theme-appropriate fill, foreground
// label, and a visible 1px border with the rounded control shape.
async function expectOutlinedDismissal(
  locator: Locator,
  theme: "light" | "dark"
) {
  await expectSettledControl(locator).toEqual({
    background: theme === "light" ? "light" : "dark",
    text: theme === "light" ? "dark" : "light",
  });

  const styles = await readControlStyles(locator);
  expect(styles.borderTopWidth).toBe("1px");
  expect(styles.borderLeftWidth).toBe("1px");
  expect(styles.borderTopColor).not.toBe(TRANSPARENT);
  expect(styles.borderTopColor).not.toBe(styles.background);
  expect(styles.borderRadius).toBe(BUTTON_RADIUS);
}

// A control carrying the theme-inverted (filled) surface -- the primary action
// in a two-button row, or the view-mode Close.
async function expectFilledPrimary(locator: Locator, theme: "light" | "dark") {
  await expectSettledControl(locator).toEqual({
    background: theme === "light" ? "dark" : "light",
    text: theme === "light" ? "light" : "dark",
  });
}

// One rule at every width: a lone control spans the footer's content width,
// inset by the footer padding on both sides.
async function expectFullWidthFooterControl(page: Page, control: Locator) {
  const footerBox = await readBox(footer(page));
  const box = await readBox(control);
  expect(
    Math.abs(box.width - (footerBox.width - 2 * FOOTER_PADDING))
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x - (footerBox.x + FOOTER_PADDING))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - 40)).toBeLessThanOrEqual(1);
}

// Two controls split the footer row evenly: primary then dismissal, same row,
// each taking half the content width minus the shared row gap.
async function expectTwoButtonRow(
  page: Page,
  primary: Locator,
  dismissal: Locator
) {
  const footerBox = await readBox(footer(page));
  const primaryBox = await readBox(primary);
  const dismissalBox = await readBox(dismissal);
  const halfWidth = (footerBox.width - 2 * FOOTER_PADDING - ROW_GAP) / 2;

  expect(Math.abs(primaryBox.y - dismissalBox.y)).toBeLessThanOrEqual(1);
  expect(primaryBox.x).toBeLessThan(dismissalBox.x);
  expect(
    Math.abs(dismissalBox.x - (primaryBox.x + primaryBox.width) - ROW_GAP)
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(primaryBox.x - (footerBox.x + FOOTER_PADDING))
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(primaryBox.width - halfWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(dismissalBox.width - halfWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(primaryBox.height - 40)).toBeLessThanOrEqual(1);
  expect(Math.abs(dismissalBox.height - 40)).toBeLessThanOrEqual(1);
}

test.describe("ND-484 task modal footer actions", () => {
  test("the view Close is inverse-filled; edit and create dismissals stay outlined across themes", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupProject(page, "treatment");

    const card = await createTask(page, "nd484 treatment target");

    for (const theme of ["light", "dark"] as const) {
      await applyTheme(page, theme);
      // Park the pointer so the idle fill is measured, not the hover fill.
      await page.mouse.move(2, 2);

      // View flow: the lone Close is the footer's only control, inverse-filled.
      await openTaskModal(page, card);
      await expect(modalButton(page, "Cancel")).toHaveCount(0);
      await expect(modalButton(page, "Save changes")).toHaveCount(0);
      await expect(footer(page).getByRole("button")).toHaveCount(1);
      const close = modalButton(page, "Close");
      await expect(close).toBeVisible();
      await expectFilledPrimary(close, theme);
      await closeDialog(page);

      // Edit flow: outlined Cancel beside the filled Save changes.
      await openTaskModal(page, card);
      await enterEditMode(page);
      await expectOutlinedDismissal(modalButton(page, "Cancel"), theme);
      await expectFilledPrimary(modalButton(page, "Save changes"), theme);
      const cancelStyles = await readControlStyles(modalButton(page, "Cancel"));
      const saveStyles = await readControlStyles(modalButton(page, "Save changes"));
      expect(saveStyles.background).not.toBe(cancelStyles.background);
      await closeDialog(page);
    }

    // Create flow: outlined Cancel beside the filled Create task.
    for (const theme of ["light", "dark"] as const) {
      await applyTheme(page, theme);
      await page.mouse.move(2, 2);

      await openCreateDialog(page);
      await expectOutlinedDismissal(modalButton(page, "Cancel"), theme);
      await expectFilledPrimary(modalButton(page, "Create task"), theme);
      const cancelStyles = await readControlStyles(modalButton(page, "Cancel"));
      const createStyles = await readControlStyles(modalButton(page, "Create task"));
      expect(createStyles.background).not.toBe(cancelStyles.background);
      await closeDialog(page);
    }
  });

  test("footer actions: one control spans the footer, two split it evenly at every breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupProject(page, "geometry");
    await applyTheme(page, "light");

    const card = await createTask(page, "nd484 geometry target");

    for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
      await page.setViewportSize(viewport);
      // Park the pointer so hover fills never leak into the reads.
      await page.mouse.move(2, 2);

      // View flow: the lone Close spans the footer at any width.
      await openTaskModal(page, card);
      await expectFullWidthFooterControl(page, modalButton(page, "Close"));
      await closeDialog(page);

      // Edit flow: Save changes and Cancel split the row evenly.
      await openTaskModal(page, card);
      await enterEditMode(page);
      await expectTwoButtonRow(
        page,
        modalButton(page, "Save changes"),
        modalButton(page, "Cancel")
      );
      await closeDialog(page);

      // Create flow mirrors the edit row.
      await openCreateDialog(page);
      await expectTwoButtonRow(
        page,
        modalButton(page, "Create task"),
        modalButton(page, "Cancel")
      );
      await closeDialog(page);
    }
  });

  test("dismissal hover fills with the accent surface; the filled Close keeps its stance", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupProject(page, "hover");
    await applyTheme(page, "light");

    const card = await createTask(page, "nd484 hover target");

    for (const theme of ["light", "dark"] as const) {
      await applyTheme(page, theme);
      await page.mouse.move(2, 2);

      // View flow: hovering Close only shifts the fill (primary at 90%); the
      // inverted stance, label, and rounded corners stay put.
      await openTaskModal(page, card);
      const close = modalButton(page, "Close");
      await expectFilledPrimary(close, theme);
      const closeIdle = await readControlStyles(close);
      await close.hover();
      const closeHovered = await hoverSettledStyles(close, closeIdle.background);
      expect(closeHovered.background).not.toBe(closeIdle.background);
      // The fill stays on the primary surface: dark under the light theme,
      // light under the dark theme.
      expect(isDark(closeHovered.background)).toBe(theme === "light");
      expect(isDark(closeHovered.text)).toBe(theme === "dark");
      expect(closeHovered.borderRadius).toBe(BUTTON_RADIUS);
      await closeDialog(page);

      // Edit flow: hovering Cancel leaves the filled primary beside it as the
      // only inverted surface in the row.
      await openTaskModal(page, card);
      await enterEditMode(page);
      const cancel = modalButton(page, "Cancel");
      await expectOutlinedDismissal(cancel, theme);
      const cancelIdle = await readControlStyles(cancel);
      await cancel.hover();
      const cancelHovered = await hoverSettledStyles(
        cancel,
        cancelIdle.background
      );
      expect(cancelHovered.background).not.toBe(cancelIdle.background);
      expect(isDark(cancelHovered.background)).toBe(theme === "dark");
      expect(isDark(cancelHovered.text)).toBe(theme === "light");
      await expectFilledPrimary(modalButton(page, "Save changes"), theme);
      await closeDialog(page);
    }
  });
});
