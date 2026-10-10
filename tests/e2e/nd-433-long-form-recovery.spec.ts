import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("long-form task and meeting drafts recover locally without background mutations", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd433-recovery"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
      tasks: { create: { title: "Recovery task", status: "Backlog", position: 0, createdByUserId: userId, updatedByUserId: userId } },
    },
    select: { id: true, tasks: { select: { id: true } } },
  });
  const taskId = project.tasks[0].id;
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH"].includes(request.method()) && request.url().includes(`/api/projects/${project.id}/`)) {
      mutations.push(request.url());
    }
  });

  try {
    await page.goto(`/projects/${project.id}#kanban`);
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    const composer = page.locator('[data-testid="task-comment-composer"] [contenteditable="true"]');
    await composer.fill("Comment before navigation");
    await page.getByRole("button", { name: "Close task" }).click();
    await page.reload();
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    await expect(page.getByText("Draft restored from this browser.")).toBeVisible();
    await expect(composer).toContainText("Comment before navigation");
    expect(mutations).toEqual([]);
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.getByText("Comment added.")).toBeVisible();
    expect(await prisma.taskComment.count({ where: { taskId } })).toBe(1);
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByLabel("Task title").fill("Recovered task title");
    await page.getByRole("button", { name: "Close task" }).click();
    await page.reload();
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await expect(page.getByLabel("Task title")).toHaveValue("Recovered task title");
    await expect(page.getByText("Draft restored from this browser.")).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).title).toBe("Recovered task title");
    await page.getByRole("button", { name: "Close task" }).click();

    await page.getByRole("button", { name: "Prepare meeting" }).click();
    await page.locator("#meeting-title").fill("Recovered preparation");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Prepare meeting" }).click();
    await expect(page.locator("#meeting-title")).toHaveValue("Recovered preparation");
    await expect(page.getByText("Draft restored from this browser.")).toBeVisible();
    expect(await prisma.projectMeetingNote.count({ where: { projectId: project.id } })).toBe(0);
    await page.getByRole("button", { name: "Save preparation" }).click();
    const meetingCard = page.getByRole("button", { name: /Recovered preparation/ });
    await expect(meetingCard).toBeVisible();
    expect(await prisma.projectMeetingNote.count({ where: { projectId: project.id } })).toBe(1);
    await meetingCard.click();
    await page.locator("#meeting-outputs").fill("Recovered output notes");
    await page.getByRole("button", { name: "Close Recovered preparation" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Recovered preparation/ }).click();
    await expect(page.locator("#meeting-outputs")).toContainText("Recovered output notes");
    await expect(page.getByText("Draft restored from this browser.")).toBeVisible();
    const saveOutput = page.waitForResponse((response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/api/projects/${project.id}/meeting-notes/`) &&
      response.ok()
    );
    await page.getByRole("button", { name: "Save notes" }).click();
    await saveOutput;
    expect((await prisma.projectMeetingNote.findFirstOrThrow({ where: { projectId: project.id } })).outputNotes).toContain("Recovered output notes");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
