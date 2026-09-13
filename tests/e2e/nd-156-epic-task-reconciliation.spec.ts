import { expect, test, type Page } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

async function chooseQuickEpic(page: Page, epicName: string) {
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Epic options" }).click();
  await page
    .locator("[data-task-options-submenu='epic']")
    .getByRole("button", { name: new RegExp(epicName) })
    .click();
}

test("Epic counts reconcile after task create, reassignment, unlink, and link", async ({
  page,
}) => {
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd-156-project");
  const firstEpicName = uniqueProjectName("nd-156-first");
  const secondEpicName = uniqueProjectName("nd-156-second");
  const taskTitle = uniqueProjectName("nd-156-task");

  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();

  for (const name of [firstEpicName, secondEpicName]) {
    const response = await page.request.post(
      `/api/projects/${projectId}/epics`,
      {
        data: {
          name,
          description: `${name} reconciliation coverage`,
        },
      }
    );
    expect(response.ok()).toBeTruthy();
  }

  await page.reload();
  // The task dialog makes background content inert, so keep these locators
  // DOM-based while the dialog remains open for the reassignment sequence.
  const epicArticles = page.locator("article:not([data-kanban-task-card])");
  const firstEpic = epicArticles.filter({ hasText: firstEpicName });
  const secondEpic = epicArticles.filter({ hasText: secondEpicName });
  await expect(firstEpic).toContainText("0/0");
  await expect(secondEpic).toContainText("0/0");

  await page.getByRole("button", { name: "New task" }).click();
  await page.locator("#task-title").fill(taskTitle);
  await page.locator("#task-epic").click();
  await page.getByRole("option", { name: new RegExp(firstEpicName) }).click();
  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/tasks$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create task" }).click();
  await createResponse;

  await expect(firstEpic).toContainText("0/1");
  await expect(firstEpic.locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuetext",
    "0 of 1 tasks completed"
  );

  await page
    .getByRole("button", { name: new RegExp(taskTitle) })
    .first()
    .click();
  await chooseQuickEpic(page, secondEpicName);
  await expect(firstEpic).toContainText("0/0");
  await expect(secondEpic).toContainText("0/1");

  await chooseQuickEpic(page, "No epic");
  await expect(secondEpic).toContainText("0/0");

  await chooseQuickEpic(page, firstEpicName);
  await expect(firstEpic).toContainText("0/1");

  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Move to" }).click();
  const moveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/tasks\/reorder$/.test(response.url()) &&
      response.ok()
  );
  await page
    .locator("#task-options-submenu-move")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await moveResponse;

  await expect(firstEpic).toContainText("1/1");
  await expect(firstEpic.locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuenow",
    "100"
  );
});
