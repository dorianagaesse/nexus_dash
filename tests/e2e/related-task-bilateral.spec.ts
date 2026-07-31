import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test.describe("bilateral related tasks", () => {
  test("adds and removes a relation from both task directions immediately and after reload", async ({
    page,
  }) => {
    await signInAsVerifiedUser(page);

    const projectName = uniqueProjectName("related-tasks");
    const taskATitle = uniqueProjectName("relation-a");
    const taskBTitle = uniqueProjectName("relation-b");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
    expect(projectId).toBeTruthy();

    for (const title of [taskATitle, taskBTitle]) {
      const response = await page.request.post(`/api/projects/${projectId}/tasks`, {
        data: { title },
      });
      expect(response.ok()).toBeTruthy();
    }

    await page.reload();
    await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();

    const openTask = async (title: string) => {
      await page
        .getByRole("button", { name: new RegExp(title) })
        .first()
        .click();
      return page.getByRole("dialog", { name: title });
    };

    let taskDialog = await openTask(taskATitle);
    await taskDialog.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByPlaceholder("Search active tasks").fill(taskBTitle);
    await page
      .getByRole("option", { name: new RegExp(`${taskBTitle}$`) })
      .click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();
    await taskDialog.getByRole("button", { name: "Close task" }).click();

    taskDialog = await openTask(taskBTitle);
    await expect(
      taskDialog.getByRole("button", { name: taskATitle, exact: true })
    ).toBeVisible();
    await taskDialog.getByRole("button", { name: "Close task" }).click();

    await page.reload();
    taskDialog = await openTask(taskBTitle);
    await expect(
      taskDialog.getByRole("button", { name: taskATitle, exact: true })
    ).toBeVisible();

    await taskDialog.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page
      .getByRole("button", { name: `Remove related task ${taskATitle}` })
      .click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();
    await taskDialog.getByRole("button", { name: "Close task" }).click();

    taskDialog = await openTask(taskATitle);
    await expect(
      taskDialog.getByRole("button", { name: taskBTitle, exact: true })
    ).toHaveCount(0);
    await taskDialog.getByRole("button", { name: "Close task" }).click();

    await page.reload();
    taskDialog = await openTask(taskATitle);
    await expect(
      taskDialog.getByRole("button", { name: taskBTitle, exact: true })
    ).toHaveCount(0);
  });
});
