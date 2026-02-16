import { expect, test } from "@playwright/test";

import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test.describe("critical UI smoke flows", () => {
  test("project creation and dashboard navigation flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-project");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page).toHaveURL(/\/projects(\?.*)?$/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  });

  test("task lifecycle and attachment interaction flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-task");
    const createdTaskTitle = uniqueProjectName("task");
    const editedTaskTitle = `${createdTaskTitle}-edited`;

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toBeVisible();

    await page.locator("#task-title").fill(createdTaskTitle);
    await page.locator("#task-label-input").fill("smoke");
    await page.locator("#task-label-input").press("Enter");

    await page.getByRole("button", { name: "Add attachment link" }).click();
    await page.locator("input[placeholder='https://...']").fill("https://example.com");
    await page.getByRole("button", { name: "Confirm attachment link" }).click();
    await page.getByRole("button", { name: "Create task" }).click();

    const createdTaskCard = page.locator("article").filter({ hasText: createdTaskTitle }).first();
    await expect(createdTaskCard).toBeVisible();

    await createdTaskCard.click();
    await expect(page.getByRole("button", { name: "Edit task" })).toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();

    await page.getByRole("button", { name: "Edit task" }).click();
    await page.getByLabel("Task title").fill(editedTaskTitle);
    await page.getByRole("button", { name: "Delete attachment" }).first().click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit task" })).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();

    await expect(page.locator("article").filter({ hasText: editedTaskTitle }).first()).toBeVisible();
  });

  test("calendar panel interaction flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-calendar");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByText("Current week events (Monday to Sunday).")).toBeVisible();

    const disconnectedState = page.getByText("Google Calendar is not connected yet.");
    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await expect(disconnectedState.or(refreshButton)).toBeVisible();

    if (await disconnectedState.isVisible()) {
      await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
      return;
    }

    await refreshButton.click();
    const syncedState = page
      .getByText(/^Synced at /)
      .or(page.getByText("Calendar connected"))
      .or(page.getByText("No events in the current week."));
    await expect(syncedState.first()).toBeVisible();
  });
});
