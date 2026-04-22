import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test.describe("critical UI smoke flows", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsVerifiedUser(page);
  });

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
    const taskComment = `Comment ${uniqueProjectName("note")}`;

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toBeVisible();

    await page.locator("#task-title").fill(createdTaskTitle);
    await page.locator("#task-label-input").fill("smoke");
    await page.locator("#task-label-input").press("Enter");

    await page.getByRole("button", { name: "Open attachment link input" }).click();
    await page.locator("input[placeholder='https://...']").fill("https://example.com");
    await page.locator("input[placeholder='https://...']").press("Enter");
    await page.getByRole("button", { name: "Create task" }).click();

    const createdTaskCard = page.locator("article").filter({ hasText: createdTaskTitle }).first();
    await expect(createdTaskCard).toBeVisible();

    await createdTaskCard.click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: "Assignee options" }).click();
    const quickAssigneeUpdateRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: /E2E Smoke User/ }).click();
    await quickAssigneeUpdateRequest;
    await expect(page.getByText("E2E Smoke User")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByLabel("Task title").fill(editedTaskTitle);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();

    const createCommentRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/comments$/.test(response.url()) &&
        response.ok()
    );
    await page.getByLabel("Task comment").fill(taskComment);
    await page.getByRole("button", { name: "Add comment" }).click();
    await createCommentRequest;
    await expect(page.getByText(taskComment)).toBeVisible();
    await expect(page.getByText("1 comment")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    const deleteAttachmentRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /\/attachments\//.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Delete attachment" }).first().click();
    await deleteAttachmentRequest;
    await expect(page.getByText("example.com")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();

    const editedTaskCard = page.locator("article").filter({ hasText: editedTaskTitle }).first();
    await expect(editedTaskCard).toBeVisible();

    await editedTaskCard.click();
    await expect(page.getByText(taskComment)).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();
  });

  test("context card rich preview flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-context");
    const contextCardTitle = uniqueProjectName("context-card");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill(contextCardTitle);
    await page.locator("#context-create-content").fill("Rich preview line one\nLine two");
    await page.getByRole("button", { name: "Create card" }).click();

    const createdCard = page.locator("article").filter({ hasText: contextCardTitle }).first();
    await expect(createdCard).toBeVisible();

    await createdCard.click();
    await expect(page.getByRole("button", { name: "Close context preview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: contextCardTitle }).last()).toBeVisible();
    await expect(page.getByText("Rich preview line one").last()).toBeVisible();
    await page.getByRole("button", { name: "Close context preview" }).click();
  });

  test("calendar panel interaction flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-calendar");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "Calendar" }).click();

    const disconnectedState = page.getByText("Connect Google Calendar to show events here.");
    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await expect(disconnectedState.or(refreshButton)).toBeVisible();

    if (await disconnectedState.isVisible()) {
      await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
      return;
    }

    await refreshButton.click();
    const syncedState = page
      .getByText(/^Synced /)
      .or(page.getByText("Connected"))
      .or(page.getByText("No events in the current week."));
    await expect(syncedState.first()).toBeVisible();
  });
});
