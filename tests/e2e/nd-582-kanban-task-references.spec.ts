import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("shows each result's own reference on cards and archived rows, including mobile", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd582"), ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
  });
  const tasks = [];
  for (const status of ["Backlog", "In Progress", "Blocked", "Done"]) {
    tasks.push(await prisma.task.create({ data: {
      projectId: project.id, title: `Identify ${status} task`, status,
      createdByUserId: userId, updatedByUserId: userId,
      description: "<p>Related to ND-567</p>",
    } }));
  }
  const archived = await prisma.task.create({ data: {
    projectId: project.id, title: "Identify archived task", status: "Done",
    createdByUserId: userId, updatedByUserId: userId,
    description: "<p>Related to ND-567</p>", archivedAt: new Date(),
  } });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/projects/${project.id}#kanban`);
  const toggle = page.getByRole("button", { name: /Kanban board/ });
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  for (const task of tasks) {
    await expect(page.locator(`[data-kanban-task-card="${task.id}"]`).getByLabel(`Task reference ND-${task.referenceNumber}`, { exact: true })).toBeVisible();
  }
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("ND-567");
  for (const task of [...tasks, archived]) {
    await expect(page.getByLabel(`Task reference ND-${task.referenceNumber}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(archived.title, { exact: true })).toBeVisible();
  await page.locator('[data-kanban-lane="Backlog"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/nd-582-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const first = tasks[0];
  await expect(page.getByLabel(`Task reference ND-${first.referenceNumber}`, { exact: true })).toBeVisible();
  await page.locator(`[data-kanban-task-card="${first.id}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/nd-582-mobile.png" });
  await page.locator(`[data-kanban-task-card="${first.id}"]`).click();
  await expect(page.getByRole("dialog", { name: first.title, exact: true })).toBeVisible();
});
