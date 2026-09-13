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

async function openDashboard(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertServingLocalBuild(page);
  const userId = await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd380-context");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();

  return { userId, projectId: projectId as string, projectName };
}

async function expandContextSection(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Project context/ }).click();
  await expect(page.getByRole("button", { name: "Add card" })).toBeVisible();
}

test.describe("ND-380 rich text in context card descriptions", () => {
  test("round-trips rich formatting and a member mention from card create into stored HTML and back", async ({
    page,
  }) => {
    const { userId, projectId } = await openDashboard(page);
    // The current user is excluded from mention suggestions, so mention a
    // second member of the project instead.
    const ownerId = await prisma.project
      .findUniqueOrThrow({
        where: { id: projectId },
        select: { ownerId: true },
      })
      .then((project) => project.ownerId);
    expect(ownerId).toBe(userId);
    const memberSuffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const memberUser = await prisma.user.create({
      data: {
        email: `mention-${memberSuffix}@nexusdash.local`,
        name: "Mention Member",
        username:
          memberSuffix.replace(/\D/g, "").slice(0, 12) || "mentionmem",
        usernameDiscriminator: memberSuffix
          .replace(/\D/g, "")
          .slice(-4)
          .padStart(4, "0"),
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    await prisma.projectMembership.create({
      data: { projectId, userId: memberUser.id, role: "editor" },
    });
    const mentionTarget = await prisma.user.findUniqueOrThrow({
      where: { id: memberUser.id },
      select: { username: true, usernameDiscriminator: true },
    });
    // Hover cards resolve chips against the server-rendered collaborator list,
    // so reload once the new member exists to refresh it.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Kanban board" })
    ).toBeVisible();
    await expandContextSection(page);
    const usernameTag = `${mentionTarget.username}#${mentionTarget.usernameDiscriminator}`;
    const cardTitle = uniqueProjectName("context-rich");

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill(cardTitle);
    const contentEditor = page.locator("#context-create-content");
    await contentEditor.click();
    await expect(contentEditor).toBeFocused();
    await page.keyboard.type("@");
    await page.keyboard.type(mentionTarget.username!.slice(0, 6));
    const mentionOption = page.getByRole("option").filter({
      hasText: new RegExp(`#${mentionTarget.usernameDiscriminator}`),
    });
    await expect(mentionOption).toBeVisible();
    await mentionOption.click();
    await page.keyboard.type(" please review.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Scope risks:");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- First risk");

    const createCardRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/context-cards$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Create card" }).click();
    await createCardRequest;

    const createdCard = await prisma.resource.findFirstOrThrow({
      where: { projectId, name: cardTitle, type: "context-card" },
      select: { id: true, content: true },
    });
    expect(createdCard.content).toContain(`@${usernameTag}`);
    expect(createdCard.content).toContain("<ul><li>First risk</li></ul>");

    const cardArticle = page
      .locator("article")
      .filter({ hasText: cardTitle })
      .first();
    await expect(cardArticle).toBeVisible();
    await expect(cardArticle).toContainText("First risk");
    await expect(cardArticle).toContainText(`@${mentionTarget.username}`);
    await expect(cardArticle).not.toContainText("<ul>");

    await cardArticle.click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.locator("ul li")).toContainText("First risk");
    const previewMention = previewDialog.locator(
      "[data-rich-mention='true']",
      { hasText: `@${mentionTarget.username}` }
    );
    await expect(previewMention).toBeVisible();
    await previewMention.hover();
    const mentionTooltip = page
      .getByRole("tooltip")
      .filter({ hasText: `#${mentionTarget.usernameDiscriminator}` });
    await expect(mentionTooltip).toBeVisible();
    await page.getByRole("button", { name: "Close context preview" }).click();

    await cardArticle
      .getByRole("button", { name: "Context card options" })
      .click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editEditor = page.locator("#context-edit-content");
    await expect(editEditor.locator("ul li")).toContainText("First risk");
    await expect(
      editEditor.locator("[data-editor-mention='true']")
    ).toHaveAttribute("data-mention-raw", `@${usernameTag}`);

    await editEditor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" — updated.");
    const saveCardRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/context-cards\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Save card" }).click();
    await saveCardRequest;

    const updatedCard = await prisma.resource.findUniqueOrThrow({
      where: { id: createdCard.id },
      select: { content: true },
    });
    expect(updatedCard.content).toContain("updated.");
    expect(updatedCard.content).toContain("<ul><li>First risk");
    expect(updatedCard.content).toContain(`@${usernameTag}`);
  });

  test("keeps legacy plain-text card descriptions readable and upgrades them on re-save", async ({
    page,
  }) => {
    const { projectId } = await openDashboard(page);
    const owner = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ownerId: true },
    });
    const legacyTitle = uniqueProjectName("legacy-card");
    const legacyCard = await prisma.resource.create({
      data: {
        type: "context-card",
        name: legacyTitle,
        content: "Legacy line one.\n\nLegacy line two.",
        projectId,
        createdByUserId: owner.ownerId,
      },
      select: { id: true },
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();
    await expandContextSection(page);

    const legacyArticle = page
      .locator("article")
      .filter({ hasText: legacyTitle })
      .first();
    await expect(legacyArticle).toBeVisible();
    await expect(legacyArticle).toContainText("Legacy line one.");
    await expect(legacyArticle).toContainText("Legacy line two.");
    await expect(legacyArticle).not.toContainText("<p>");

    await legacyArticle.click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog).toContainText("Legacy line one.");
    await expect(previewDialog).toContainText("Legacy line two.");
    await page.getByRole("button", { name: "Close context preview" }).click();

    await legacyArticle
      .getByRole("button", { name: "Context card options" })
      .click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editEditor = page.locator("#context-edit-content");
    await expect(editEditor.locator("p")).toHaveCount(2);
    await expect(editEditor).toContainText("Legacy line two.");

    await editEditor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" — updated.");
    const saveCardRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/context-cards\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Save card" }).click();
    await saveCardRequest;

    const upgradedCard = await prisma.resource.findUniqueOrThrow({
      where: { id: legacyCard.id },
      select: { content: true },
    });
    expect(upgradedCard.content).toContain("<p>Legacy line one.</p>");
    expect(upgradedCard.content).toContain("Legacy line two. — updated.");
  });
});
