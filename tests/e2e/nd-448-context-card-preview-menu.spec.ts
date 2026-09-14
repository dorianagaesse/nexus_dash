import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

async function assertServingLocalBuild(page: import("@playwright/test").Page) {
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

async function expandContextSection(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Project context/ }).click();
  await expect(page.getByRole("button", { name: "Add card" })).toBeVisible();
}

async function openDashboardWithCard(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertServingLocalBuild(page);
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd448-context");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();

  const owner = await prisma.project.findUniqueOrThrow({
    where: { id: projectId as string },
    select: { ownerId: true },
  });
  const cardTitle = uniqueProjectName("preview-menu-card");
  const card = await prisma.resource.create({
    data: {
      type: "context-card",
      name: cardTitle,
      content: "<p>Preview menu coverage.</p>",
      projectId: projectId as string,
      createdByUserId: owner.ownerId,
    },
    select: { id: true },
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();
  await expandContextSection(page);

  return { projectId: projectId as string, cardTitle, cardId: card.id };
}

test.describe("ND-448 context card preview options menu", () => {
  test("exposes Edit on the open card and keeps Escape and double-click editing working", async ({
    page,
  }) => {
    const { cardTitle } = await openDashboardWithCard(page);

    const cardArticle = page
      .locator("article")
      .filter({ hasText: cardTitle })
      .first();
    await cardArticle.click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog).toContainText(cardTitle);

    const optionsButton = previewDialog.getByRole("button", {
      name: "Context card options",
    });
    await expect(optionsButton).toBeVisible();

    // Keyboard access: Enter on the focused trigger opens the menu.
    await optionsButton.focus();
    await expect(optionsButton).toBeFocused();
    await page.keyboard.press("Enter");
    const editItem = previewDialog.getByRole("button", {
      name: "Edit",
      exact: true,
    });
    await expect(editItem).toBeVisible();

    // First Escape closes the menu but keeps the card open.
    await page.keyboard.press("Escape");
    await expect(editItem).toBeHidden();
    await expect(previewDialog).toBeVisible();

    // Edit routes into the existing edit flow.
    await optionsButton.click();
    await editItem.click();
    await expect(page.locator("#context-edit-title")).toHaveValue(cardTitle);
    await page.getByRole("button", { name: "Close Edit context card" }).click();
    await expect(page.locator("#context-edit-title")).toHaveCount(0);

    // Double-click-to-edit still works on the open card.
    await cardArticle.click();
    await expect(previewDialog).toBeVisible();
    await previewDialog.getByRole("heading", { name: cardTitle }).dblclick();
    await expect(page.locator("#context-edit-content")).toBeVisible();
    await page.getByRole("button", { name: "Close Edit context card" }).click();
    await expect(page.locator("#context-edit-content")).toHaveCount(0);

    // With the menu closed, Escape closes the card preview again.
    await cardArticle.click();
    await expect(previewDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(previewDialog).toBeHidden();
  });

  test("removes the open card through the preview menu and delete confirmation", async ({
    page,
  }) => {
    const { cardTitle, cardId } = await openDashboardWithCard(page);

    const cardArticle = page
      .locator("article")
      .filter({ hasText: cardTitle })
      .first();
    await cardArticle.click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();

    await previewDialog
      .getByRole("button", { name: "Context card options" })
      .click();
    await previewDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toContainText("Delete context card?");
    await expect(confirmDialog).toContainText(cardTitle);
    await expect(previewDialog).toBeHidden();

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes(`/context-cards/${cardId}`) &&
        response.ok()
    );
    await confirmDialog.getByRole("button", { name: "Delete card" }).click();
    await deleteResponse;

    await expect(
      page.locator("article").filter({ hasText: cardTitle })
    ).toHaveCount(0);
    const deletedCard = await prisma.resource.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    expect(deletedCard).toBeNull();
  });
});
