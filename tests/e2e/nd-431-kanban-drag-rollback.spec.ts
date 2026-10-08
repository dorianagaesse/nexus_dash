import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("failed keyboard reorder restores the visible and stored task order", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd431-rollback"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
      tasks: {
        create: ["First", "Second", "Third"].map((title, position) => ({
          title,
          status: "Backlog",
          position,
          createdByUserId: userId,
          updatedByUserId: userId,
        })),
      },
    },
    select: { id: true },
  });

  try {
    const original = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const originalIds = original.map((task) => task.id);
    await page.route(`**/api/projects/${project.id}/tasks/reorder`, (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
    );
    await page.goto(`/projects/${project.id}#kanban`);

    const cards = page.locator('[data-kanban-dropzone="Backlog"] [data-kanban-task-card]');
    await expect(cards).toHaveCount(3);
    await cards.first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();
    await cards.first().focus();
    await page.keyboard.press("Space");
    await expect(cards.first()).toHaveCSS("position", "fixed");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");

    await expect(page.getByText("Could not save task movement. Board reverted.")).toBeVisible();
    await expect.poll(() => cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-kanban-task-card"))
    )).toEqual(originalIds);
    const stored = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(stored.map((task) => task.id)).toEqual(originalIds);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
