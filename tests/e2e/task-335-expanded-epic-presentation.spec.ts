import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { clickUntilVisible } from "./helpers/interaction-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

for (const width of [375, 1440]) {
  test(`bounds epic rows and opens all linked tasks in completion order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const project = await prisma.project.create({
      data: {
        name: uniqueProjectName("nd-832-epic-rows"),
        ownerId: userId,
        memberships: { create: { userId, role: "owner" } },
      },
    });
    const author = { projectId: project.id, createdByUserId: userId, updatedByUserId: userId };
    await prisma.epic.createMany({
      data: Array.from({ length: 35 }, (_, index) => ({
        ...author,
        name: `Initiative ${index + 1}`,
        description: "An initiative with no linked tasks.",
      })),
    });
    const epic = await prisma.epic.create({
      data: {
        ...author,
        name: "Workspace rollout",
        description: "A complete description of the rollout and its expected outcome.",
      },
    });
    const statuses = ["Done", "In Progress", "Blocked", "Backlog", "Done", "Backlog", "In Progress", "Blocked"];
    await prisma.task.createMany({
      data: statuses.map((status, index) => ({
        ...author,
        epicId: epic.id,
        title: `Rollout work item ${index + 1}`,
        status,
        position: index,
        completedAt: status === "Done" ? new Date() : null,
      })),
    });
    await page.goto(`/projects/${project.id}#epics`);
    const row = page.getByRole("article", { name: epic.name });
    const list = page.getByRole("region", { name: "Epic list", exact: true });
    await expect(row).toBeVisible();
    await expect(list.getByRole("article")).toHaveCount(36);
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    await expect(row).toContainText("8");
    const bounds = await list.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(576);
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    for (const label of ["Edit", "Archive", "Delete"]) {
      const action = row.getByRole("button", { name: `${label} epic ${epic.name}` });
      await expect(action).toBeVisible();
      const actionBounds = await action.boundingBox();
      expect(actionBounds!.width).toBeGreaterThanOrEqual(44);
      expect(actionBounds!.height).toBeGreaterThanOrEqual(44);
    }
    const dialog = page.getByRole("dialog", { name: epic.name });
    await clickUntilVisible(row.getByRole("button", { name: `Open epic ${epic.name}` }), dialog);
    await expect(dialog.getByText(epic.description)).toBeVisible();
    const links = dialog.getByRole("link");
    await expect(links).toHaveCount(8);
    expect(await links.allTextContents()).toEqual([
      expect.stringContaining("Rollout work item 4"),
      expect.stringContaining("Rollout work item 6"),
      expect.stringContaining("Rollout work item 3"),
      expect.stringContaining("Rollout work item 8"),
      expect.stringContaining("Rollout work item 2"),
      expect.stringContaining("Rollout work item 7"),
      expect.stringContaining("Rollout work item 1"),
      expect.stringContaining("Rollout work item 5"),
    ]);
    await links.first().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Rollout work item 4", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
