import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MAX_TASK_TITLE_LENGTH = 120;
const CORNER_BAND_PX = 96;
const MIN_TARGET_PX = 36;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesIntersect(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

async function requireBox(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `${label} has no layout box`).not.toBeNull();
  return box as Box;
}

async function assertServingLocalBuild(page: Page) {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return;
  }
  // Playwright reuses any server already listening on its port
  // (reuseExistingServer). Several worktrees run `next start` on the same
  // machine, so fail fast when the port is serving another build instead of
  // letting it look like an app flake downstream.
  const { version } = JSON.parse(
    readFileSync("package.json", "utf8")
  ) as { version: string };
  const response = await page.goto("/");
  const html = (await response?.text()) ?? "";
  expect(
    html.includes(`v${version}`),
    `The server on ${page.url()} is not this worktree's build (expected v${version}). Another worktree's next start is occupying the test port.`
  ).toBe(true);
}

async function ensureBoardExpanded(page: Page) {
  const headerToggle = page.getByRole("button", { name: /Kanban board/ });
  if ((await headerToggle.getAttribute("aria-expanded")) === "false") {
    await headerToggle.click();
  }
  await expect(page.getByRole("searchbox", { name: "Search tasks" })).toBeVisible();
}

function buildLongTitle(): string {
  const filler = " long title wrapping coverage";
  let title = uniqueProjectName("nd466");

  while (title.length + filler.length <= MAX_TASK_TITLE_LENGTH) {
    title += filler;
  }

  return title;
}

async function openTaskModal(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await assertServingLocalBuild(page);

  const userId = await signInAsVerifiedUser(page);
  // Project actor surfaces render the username as the display name.
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true },
  });
  const actorName = actor.username as string;
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd466-controls"),
      description: "Task modal control placement coverage",
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
  const title = buildLongTitle();
  const task = await prisma.task.create({
    data: {
      title,
      projectId: project.id,
      status: "Backlog",
      position: 0,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: { id: true },
  });

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);
  await page.locator(`[data-kanban-task-id="${task.id}"]`).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("h3").first()).toHaveText(title);

  return { dialog, title, actorName };
}

async function assignCurrentUserFromOverflowMenu(dialog: Locator, actorName: string) {
  await dialog.getByRole("button", { name: "Task options" }).click();
  await dialog.getByRole("button", { name: "Assignee options" }).click();
  await dialog
    .locator("[data-task-options-submenu='assignee']")
    .locator("button")
    .filter({ hasText: actorName })
    .first()
    .click();
  await expect(dialog.locator("[data-task-assignee-name='true']")).toHaveText(
    actorName
  );
}

async function expectControlsAnchoredAtTopRight(dialog: Locator) {
  const optionsButton = dialog.getByRole("button", { name: "Task options" });
  const closeButton = dialog.getByRole("button", { name: "Close task" });
  await expect(optionsButton).toBeVisible();
  await expect(closeButton).toBeVisible();

  const dialogBox = await requireBox(dialog, "task dialog");
  const titleBox = await requireBox(dialog.locator("h3").first(), "task title");
  const assigneeBox = await requireBox(
    dialog.locator("[data-task-assignee-badge='true']"),
    "assignee row"
  );

  for (const [name, locator] of [
    ["overflow control", optionsButton],
    ["close control", closeButton],
  ] as const) {
    const box = await requireBox(locator, name);

    // Anchored inside the modal's top-right corner band.
    expect(box.x + box.width, `${name} sits past the modal's right edge`).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + 1
    );
    expect(box.y, `${name} starts above the modal's top edge`).toBeGreaterThanOrEqual(
      dialogBox.y
    );
    expect(box.y - dialogBox.y, `${name} is not pinned to the top`).toBeLessThan(
      CORNER_BAND_PX
    );
    expect(
      dialogBox.x + dialogBox.width - (box.x + box.width),
      `${name} is not pinned to the right`
    ).toBeLessThan(CORNER_BAND_PX);

    // Easy to target.
    expect(box.width, `${name} target width`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box.height, `${name} target height`).toBeGreaterThanOrEqual(MIN_TARGET_PX);

    // Above and independent of the assignee row, clear of the long title.
    expect(box.y + box.height, `${name} is not above the assignee row`).toBeLessThanOrEqual(
      assigneeBox.y + 1
    );
    expect(
      boxesIntersect(box, assigneeBox),
      `${name} overlaps the assignee row`
    ).toBe(false);
    expect(boxesIntersect(box, titleBox), `${name} overlaps the title`).toBe(false);
  }
}

test.describe("ND-466 task modal controls placement", () => {
  test("keeps the overflow and close controls at the top-right on desktop", async ({
    page,
  }) => {
    const { dialog, actorName } = await openTaskModal(page, DESKTOP_VIEWPORT);
    await assignCurrentUserFromOverflowMenu(dialog, actorName);

    await expectControlsAnchoredAtTopRight(dialog);

    // Keyboard access: Enter on the focused trigger opens the overflow menu.
    const optionsButton = dialog.getByRole("button", { name: "Task options" });
    const editAction = dialog.getByRole("button", { name: "Edit", exact: true });
    await optionsButton.focus();
    await expect(optionsButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editAction).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Delete", exact: true })
    ).toBeVisible();

    // The overflow actions keep their behavior after the move.
    await editAction.click();
    const titleField = dialog.locator("[aria-label='Task title']");
    await expect(titleField).toBeVisible();

    // The close control keeps its behavior after the move: dismissing from
    // edit mode closes the task UI and discards the edit session (ND-465).
    await dialog.getByRole("button", { name: "Close task" }).click();
    await expect(dialog).toBeHidden();
  });

  test("keeps the overflow and close controls at the top-right on mobile", async ({
    page,
  }) => {
    const { dialog, actorName } = await openTaskModal(page, MOBILE_VIEWPORT);
    await assignCurrentUserFromOverflowMenu(dialog, actorName);

    await expectControlsAnchoredAtTopRight(dialog);

    const closeButton = dialog.getByRole("button", { name: "Close task" });
    await closeButton.focus();
    await expect(closeButton).toBeFocused();
    await closeButton.click();
    await expect(dialog).toBeHidden();
  });
});
