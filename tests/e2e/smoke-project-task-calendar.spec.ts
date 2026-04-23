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
    const epicName = uniqueProjectName("epic");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
    expect(projectId).toBeTruthy();

    const createEpicResponse = await page.request.post(`/api/projects/${projectId}/epics`, {
      data: {
        name: epicName,
        description: "Smoke-test epic for quick assignment coverage.",
      },
    });
    expect(createEpicResponse.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toBeVisible();

    await page.locator("#task-title").fill(createdTaskTitle);
    await page.locator("#task-label-input").fill("smoke");
    await page.locator("#task-label-input").press("Enter");

    await page.getByRole("button", { name: "Open attachment link input" }).click();
    await page.locator("input[placeholder='https://...']").fill("https://example.com");
    await page.locator("input[placeholder='https://...']").press("Enter");
    await page.getByRole("button", { name: "Create task" }).click();

    const createdTaskCard = page
      .getByRole("button", { name: new RegExp(createdTaskTitle) })
      .first();
    await expect(createdTaskCard).toBeVisible();

    await createdTaskCard.click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    const epicOptionsButton = page.getByRole("button", { name: "Epic options" });
    await epicOptionsButton.click();
    const epicOptionsGroup = page.locator("[data-task-options-submenu='epic']");
    await expect(epicOptionsGroup).toBeVisible();
    const epicOptionButtons = epicOptionsGroup.getByRole("button");
    await expect(epicOptionButtons).toHaveCount(2);
    const quickEpicUpdateRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await epicOptionButtons.nth(1).click();
    await quickEpicUpdateRequest;
    await expect(page.getByText(`Epic updated to ${epicName}.`)).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    const assigneeOptionsButton = page.getByRole("button", { name: "Assignee options" });
    await assigneeOptionsButton.click();
    const assigneeSubmenu = page.locator("[data-task-options-submenu='assignee']");
    await expect(assigneeSubmenu).toBeVisible();
    const assigneeOptionButtons = assigneeSubmenu.getByRole("button");
    await expect(assigneeOptionButtons).toHaveCount(2);
    const quickAssigneeUpdateRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await assigneeOptionButtons.nth(1).click();
    await quickAssigneeUpdateRequest;
    await expect(page.locator("[data-task-assignee-name='true']")).toBeVisible();

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

    const editedTaskCard = page
      .getByRole("button", { name: new RegExp(editedTaskTitle) })
      .first();
    await expect(editedTaskCard).toBeVisible();

    await editedTaskCard.click();
    await expect(page.getByRole("button", { name: "Close task" })).toBeVisible();
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

  test("roadmap grouped milestone flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-roadmap");
    const phaseTitle = uniqueProjectName("milestone");
    const eventTitle = uniqueProjectName("event");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "New milestone" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#roadmap-entity-title").fill(phaseTitle);
    await page.locator("#roadmap-entity-description").fill("Roadmap milestone for smoke coverage.");
    await page.getByRole("button", { name: "Create milestone" }).last().click();

    await expect(page.getByText(phaseTitle)).toBeVisible();
    await expect(page.getByText("0 events")).toBeVisible();

    await page.getByRole("button", { name: "Event" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#roadmap-entity-title").fill(eventTitle);
    await page.locator("#roadmap-entity-description").fill("First event inside the milestone.");
    await page.getByRole("button", { name: "Create event" }).last().click();

    await expect(page.getByText(eventTitle)).toBeVisible();
    await expect(page.getByText("1 event")).toBeVisible();

    await page.getByRole("button", { name: "View" }).first().click();
    await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible();
    await expect(page.getByText(phaseTitle)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
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
