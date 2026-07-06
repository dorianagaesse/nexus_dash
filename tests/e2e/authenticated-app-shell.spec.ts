import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

async function createProjectTaskNotification(
  page: Parameters<typeof signInAsVerifiedUser>[0],
  userId: string
) {
  const projectName = uniqueProjectName("shell-navigation");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);
  const projectId = new URL(page.url()).pathname.split("/").at(-1);
  expect(projectId).toBeTruthy();

  const task = await prisma.task.create({
    data: {
      title: "Restore navigation context",
      projectId: projectId!,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });
  await prisma.notification.create({
    data: {
      recipientUserId: userId,
      type: "task_assignment",
      title: "Assigned: Restore navigation context",
      body: "Open the task and return to notification triage.",
      targetPath: `/projects/${projectId}?taskId=${task.id}`,
      sourceType: "e2e_shell_navigation",
      sourceId: task.id,
    },
  });

  return { projectId: projectId!, taskId: task.id };
}

test.describe("responsive authenticated app shell", () => {
  test("preserves project context through account detours and browser history", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId } = await createProjectTaskNotification(page, userId);
    const projectPath = `/projects/${projectId}?taskId=${taskId}#kanban`;
    await page.goto(projectPath);

    const desktopNavigation = page.locator(
      "header nav[aria-label='Primary navigation']"
    );
    await expect(
      desktopNavigation.getByRole("link", { name: "Projects" })
    ).toHaveAttribute("aria-current", "page");

    const notificationsHref = await desktopNavigation
      .getByRole("link", { name: "Notifications" })
      .getAttribute("href");
    expect(notificationsHref).toBeTruthy();
    await page.goto(notificationsHref!);
    await expect(page).toHaveURL(/\/account\/notifications\?returnTo=/);
    let currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/account/notifications");
    expect(currentUrl.searchParams.get("returnTo")).toBe(projectPath);

    await desktopNavigation.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/account\?returnTo=/);
    currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/account");
    expect(currentUrl.searchParams.get("returnTo")).toBe(projectPath);

    await page.getByRole("link", { name: "Return to project" }).click();
    await expect(page).toHaveURL(new RegExp(`${projectId}\\?taskId=${taskId}#kanban$`));

    await page.goto(
      `/account/settings?returnTo=${encodeURIComponent(projectPath)}`
    );
    await expect(page).toHaveURL(/\/account\/settings\?returnTo=/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${projectId}\\?taskId=${taskId}#kanban$`));
  });

  test("returns from a notification target to the notification list", async ({ page }) => {
    const userId = await signInAsVerifiedUser(page);
    const { projectId, taskId } = await createProjectTaskNotification(page, userId);
    await page.goto("/account/notifications");

    await page
      .getByRole("article")
      .filter({ hasText: "Assigned: Restore navigation context" })
      .getByRole("link", { name: "Open" })
      .click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?`));

    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe(`/projects/${projectId}`);
    expect(currentUrl.searchParams.get("taskId")).toBe(taskId);
    expect(currentUrl.searchParams.get("returnTo")).toContain(
      "/account/notifications"
    );

    await page.getByRole("link", { name: "Return to notifications" }).click();
    await expect(page).toHaveURL(/\/account\/notifications/);
    await expect(
      page.getByRole("heading", { name: "Notifications" })
    ).toBeVisible();
  });

  test("uses safe fallbacks for direct and unsafe entries", async ({ page }) => {
    await signInAsVerifiedUser(page);
    await page.goto(
      "/account/settings?returnTo=https%3A%2F%2Fevil.example%2Fphish"
    );

    const fallback = page
      .locator("#app-main-content")
      .getByRole("link", { name: "Account" })
      .first();
    await expect(fallback).toHaveAttribute("href", "/account");
    await fallback.click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("fits labeled controls and reserved content at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsVerifiedUser(page);
    await page.goto("/projects");

    const mobileNavigation = page.locator(
      "body > div nav[aria-label='Primary navigation']:visible"
    );
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole("link")).toHaveCount(4);

    const geometry = await mobileNavigation.getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    );
    expect(geometry.every(({ height }) => height >= 44)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);

    const navigationBox = await mobileNavigation.boundingBox();
    const mainBox = await page.locator("#app-main-content").boundingBox();
    expect(navigationBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(navigationBox!.y).toBeGreaterThan(0);
  });
});
