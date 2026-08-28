import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const STATUS_TASK_COUNTS = {
  Backlog: 14,
  "In Progress": 12,
  Blocked: 9,
  Done: 8,
} as const;

async function createDenseKanbanProject(userId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("bounded-kanban"),
      description: "Dense Kanban fixture for independent lane scrolling.",
      ownerId: userId,
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });

  const tasks = Object.entries(STATUS_TASK_COUNTS).flatMap(([status, count]) =>
    Array.from({ length: count }, (_, index) => ({
      title: `${status} dense task ${String(index + 1).padStart(2, "0")}`,
      description:
        "Enough descriptive content to make each card exercise realistic lane density.",
      status,
      position: index,
      completedAt: status === "Done" ? new Date() : null,
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    }))
  );

  await prisma.task.createMany({ data: tasks });
  await prisma.task.create({
    data: {
      title: "Archived dense task",
      status: "Done",
      position: STATUS_TASK_COUNTS.Done,
      completedAt: new Date(),
      archivedAt: new Date(),
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });

  const keyboardTask = await prisma.task.findFirstOrThrow({
    where: {
      projectId: project.id,
      status: "Backlog",
      position: 0,
    },
    select: { id: true, title: true },
  });

  return { projectId: project.id, keyboardTask };
}

test.describe("TASK-381 bounded Kanban lanes", () => {
  test("bounds dense desktop lanes and preserves keyboard drag with independent scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId, keyboardTask } = await createDenseKanbanProject(userId);

    await page.goto(`/projects/${projectId}#kanban`);
    await expect(
      page.getByRole("heading", { name: "Kanban board" })
    ).toBeVisible();

    const backlogLane = page.locator('[data-kanban-lane="Backlog"]');
    const backlogScroller = page.getByRole("region", { name: "Backlog" });
    const progressScroller = page.getByRole("region", { name: "In Progress" });
    await expect(backlogScroller).toBeVisible();
    await expect(progressScroller).toBeVisible();

    const metrics = await backlogScroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      laneHeight: element
        .closest<HTMLElement>("[data-kanban-lane]")
        ?.getBoundingClientRect().height,
    }));
    expect(metrics.laneHeight).toBeGreaterThanOrEqual(320);
    expect(metrics.laneHeight).toBeLessThanOrEqual(673);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.overflowY).toBe("auto");

    const laneHeader = backlogLane.locator("#kanban-lane-backlog-title");
    const headerTop = (await laneHeader.boundingBox())?.y;
    await backlogScroller.evaluate((element) => {
      element.scrollTop = 240;
    });
    await expect
      .poll(() => backlogScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await progressScroller.evaluate((element) => element.scrollTop)
    ).toBe(0);
    expect((await laneHeader.boundingBox())?.y).toBe(headerTop);

    await backlogScroller.focus();
    await expect(backlogScroller).toBeFocused();
    expect(
      await backlogScroller.evaluate(
        (element) => getComputedStyle(element).boxShadow
      )
    ).not.toBe("none");

    await backlogScroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const draggableTask = page.locator(
      `[data-kanban-task-id="${keyboardTask.id}"]`
    );
    await draggableTask.focus();
    const reorderRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/tasks\/reorder$/.test(response.url())
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    expect((await reorderRequest).ok()).toBe(true);
    await expect(progressScroller).toContainText(keyboardTask.title);

    const pointerTask = page
      .locator('[data-kanban-lane="Backlog"] [data-kanban-task-id]')
      .first();
    const blockedScroller = page.getByRole("region", { name: "Blocked" });
    await pointerTask.scrollIntoViewIfNeeded();
    const pointerTaskTitle = await pointerTask.locator("h3").textContent();
    const pointerTaskBounds = await pointerTask.boundingBox();
    const blockedBounds = await blockedScroller.boundingBox();
    expect(pointerTaskBounds).not.toBeNull();
    expect(blockedBounds).not.toBeNull();
    const pointerReorderRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/tasks\/reorder$/.test(response.url())
    );
    const sourceX = pointerTaskBounds!.x + pointerTaskBounds!.width / 2;
    const sourceY = pointerTaskBounds!.y + 20;
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 12, sourceY + 8, { steps: 8 });
    await page.mouse.move(
      blockedBounds!.x + blockedBounds!.width / 2,
      blockedBounds!.y + Math.min(80, blockedBounds!.height / 2),
      { steps: 24 }
    );
    await page.mouse.up();
    expect((await pointerReorderRequest).ok()).toBe(true);
    await expect(blockedScroller).toContainText(pointerTaskTitle ?? "");

    const archiveSummary = page.getByText("Archive (1)", { exact: true });
    await expect(archiveSummary).toBeVisible();
    await archiveSummary.click();
    await expect(
      page.getByRole("region", { name: "Archived Done tasks" })
    ).toContainText("Archived dense task");
  });

  test("keeps mobile lane scroll state and viewport containment", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 667 });
    const userId = await signInAsVerifiedUser(page);
    const { projectId } = await createDenseKanbanProject(userId);

    await page.goto(`/projects/${projectId}#kanban`);
    await page.evaluate(() => {
      window.localStorage.setItem("nexusdash-theme", "dark");
      document.documentElement.classList.add("dark");
    });
    await expect(page.locator("html")).toHaveClass(/dark/);
    const backlogScroller = page.getByRole("region", { name: "Backlog" });
    await expect(backlogScroller).toBeVisible();
    await backlogScroller.evaluate((element) => {
      element.scrollTop = 180;
    });
    const backlogScrollTop = await backlogScroller.evaluate(
      (element) => element.scrollTop
    );
    expect(backlogScrollTop).toBeGreaterThan(0);

    const statusNavigation = page.getByRole("navigation", {
      name: "Kanban status navigation",
    });
    await statusNavigation
      .getByRole("button", { name: /In Progress, 12 tasks/ })
      .click();
    await expect(
      page.getByRole("region", { name: "In Progress" })
    ).toBeVisible();
    await statusNavigation
      .getByRole("button", { name: /Backlog, 14 tasks/ })
      .click();
    await expect(backlogScroller).toBeVisible();
    expect(await backlogScroller.evaluate((element) => element.scrollTop)).toBe(
      backlogScrollTop
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);

    await page.setViewportSize({ width: 667, height: 375 });
    const landscapeLaneHeight = await page
      .locator('[data-kanban-lane="Backlog"]')
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(landscapeLaneHeight).toBe(320);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
});
