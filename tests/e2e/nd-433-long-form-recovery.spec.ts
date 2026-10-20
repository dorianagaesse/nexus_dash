import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("task drafts recover and meeting preparation saves on dismissal", async ({ page }) => {
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
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("nexusdash.draft.v1:")).length
        )
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Close task" }).click();
    await page.reload();
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    await expect(page.getByText("Draft restored.")).toBeVisible();
    await expect(composer).toContainText("Comment before navigation");
    expect(mutations).toEqual([]);
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.getByText("Comment added.")).toBeVisible();
    expect(await prisma.taskComment.count({ where: { taskId } })).toBe(1);
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByLabel("Task title").fill("Recovered task title");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("nexusdash.draft.v1:")).length
        )
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Close task" }).click();
    await page.reload();
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await expect(page.getByLabel("Task title")).toHaveValue("Recovered task title");
    await expect(page.getByText("Draft restored.")).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).title).toBe("Recovered task title");
    await page.getByRole("button", { name: "Close task" }).click();

    await page.getByRole("button", { name: "Prepare meeting" }).click();
    await page.locator("#meeting-inputs").fill("Agenda without a title");
    await page.mouse.click(5, 5);
    await page.mouse.click(5, 5);
    await expect(page.getByText("Meeting title is required.")).toBeVisible();
    expect(await prisma.projectMeetingNote.count({ where: { projectId: project.id } })).toBe(0);
    await page.locator("#meeting-title").fill("Recovered preparation");
    expect(await prisma.projectMeetingNote.count({ where: { projectId: project.id } })).toBe(0);
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);
    const createPreparation = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/api/projects/${project.id}/meeting-notes`) &&
      response.ok()
    );
    await page.mouse.click(5, 5);
    await createPreparation;
    const meetingCard = page.getByRole("button", { name: /Recovered preparation/ });
    await expect(meetingCard).toBeVisible();
    expect(await prisma.projectMeetingNote.count({ where: { projectId: project.id } })).toBe(1);
    await meetingCard.click();
    await page.getByRole("button", { name: "Edit prep" }).click();
    await page.locator("#meeting-title").fill("Updated preparation");
    const updatePreparation = page.waitForResponse((response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/api/projects/${project.id}/meeting-notes/`) &&
      response.ok()
    );
    await page.mouse.click(5, 5);
    await updatePreparation;
    await expect(page.getByRole("button", { name: /Updated preparation/ })).toBeVisible();
    await page.getByRole("button", { name: /Updated preparation/ }).click();
    await page.locator("#meeting-outputs").fill("Recovered output notes");
    await page.getByRole("button", { name: "Close Updated preparation" }).click();
    await page.reload();
    await page.getByRole("button", { name: /Updated preparation/ }).click();
    await expect(page.locator("#meeting-outputs")).toContainText("Recovered output notes");
    await expect(page.getByRole("button", { name: /Discard draft|Keep draft|Confirm discard/ })).toHaveCount(0);
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

test("comment recovery stays silent on mobile and keeps actionable error states", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd433-mobile-recovery"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
      tasks: { create: { title: "Mobile recovery task", status: "Backlog", position: 0, createdByUserId: userId, updatedByUserId: userId } },
    },
    select: { id: true, tasks: { select: { id: true } } },
  });
  const taskId = project.tasks[0].id;

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${project.id}#kanban`);
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    const composer = page.locator('[data-testid="task-comment-composer"] [contenteditable="true"]');
    await composer.fill("Mobile comment before navigation");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("nexusdash.draft.v1:")).length
        )
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);

    await page.getByRole("button", { name: "Close task" }).click();
    await page.reload();
    await page.locator(`[data-kanban-task-card="${taskId}"]`).click();
    const restored = page.getByText("Draft restored.");
    await expect(restored).toBeVisible();
    await expect(composer).toContainText("Mobile comment before navigation");
    const restoredBox = await restored.boundingBox();
    expect(restoredBox).not.toBeNull();
    expect(restoredBox!.x).toBeGreaterThanOrEqual(0);
    expect(restoredBox!.x + restoredBox!.width).toBeLessThanOrEqual(390);

    await page.getByRole("button", { name: "Discard draft" }).click();
    await page.getByRole("button", { name: "Confirm discard" }).click();
    await expect(restored).toHaveCount(0);
    await expect(composer).toHaveText("");

    await page.addInitScript(() => {
      const deny = () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      };
      Object.defineProperty(window.localStorage, "setItem", { configurable: true, value: deny });
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Close task" })).toBeVisible();
    await composer.fill("Comment that cannot be stored");
    await expect(
      page.getByText("This draft could not be stored in this browser. Copy your changes before leaving.")
    ).toBeVisible();
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
