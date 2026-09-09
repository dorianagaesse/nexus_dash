import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

function repeatToLength(fragment: string, length: number): string {
  const repeated = fragment.repeat(Math.ceil(length / fragment.length));
  return repeated.slice(0, length).trimEnd();
}

async function createBoardProject(ownerUserId: string) {
  return prisma.project.create({
    data: {
      name: uniqueProjectName("nd407-title"),
      description: "Task title cap coverage",
      ownerId: ownerUserId,
      memberships: {
        create: {
          userId: ownerUserId,
          role: "owner",
        },
      },
    },
    select: {
      id: true,
    },
  });
}

async function createBoardTask(input: {
  projectId: string;
  userId: string;
  title: string;
  position: number;
}) {
  return prisma.task.create({
    data: {
      title: input.title,
      projectId: input.projectId,
      status: "Backlog",
      position: input.position,
      labelsJson: null,
      epicId: null,
      archivedAt: null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
    },
    select: {
      id: true,
    },
  });
}

async function ensureBoardExpanded(page: import("@playwright/test").Page) {
  const headerToggle = page.getByRole("button", { name: /Kanban board/ });
  if ((await headerToggle.getAttribute("aria-expanded")) === "false") {
    await headerToggle.click();
  }
  await expect(
    page.getByRole("searchbox", { name: "Search tasks" })
  ).toBeVisible();
}

test.describe("ND-407 task title cap", () => {
  test("create dialog caps input at 120 characters and shows the live counter near the limit", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const project = await createBoardProject(userId);
    await page.goto(`/projects/${project.id}`);
    await ensureBoardExpanded(page);

    await page.getByRole("button", { name: "New task" }).click();
    const titleInput = page.locator("#task-title");
    await expect(titleInput).toBeVisible();

    await titleInput.click();
    await page.keyboard.type("a".repeat(130));
    await expect(titleInput).toHaveValue("a".repeat(120));
    await expect(
      page.getByText("120/120 characters", { exact: true })
    ).toBeVisible();

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("a".repeat(99));
    await expect(page.getByText(/characters$/)).toHaveCount(0);

    await page.keyboard.type("a");
    await expect(
      page.getByText("100/120 characters", { exact: true })
    ).toBeVisible();

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("a ");
    const createButton = page.getByRole("button", { name: "Create task" });
    await createButton.click();
    await expect(
      page.getByText("Task title must be at least 2 characters long.")
    ).toBeVisible();
    await expect(createButton).toBeEnabled();
    await expect(createButton).toHaveText("Create task");
  });

  test("clamps a legacy overlong card title to two lines on mobile while the modal keeps the full title", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const project = await createBoardProject(userId);
    const legacyTitle = repeatToLength(
      "legacy overlong title written before the cap existed ",
      170
    );
    await createBoardTask({
      projectId: project.id,
      userId,
      title: legacyTitle,
      position: 0,
    });
    await page.goto(`/projects/${project.id}`);
    await ensureBoardExpanded(page);
    await page.setViewportSize({ width: 375, height: 667 });

    const card = page.locator('[data-kanban-task-card]', {
      hasText: legacyTitle,
    });
    await expect(card).toBeVisible();
    const heading = card.locator("h3");
    await expect(heading).toHaveText(legacyTitle);
    const clampMetrics = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        lineClamp: style.webkitLineClamp,
        overflowWrap: style.overflowWrap,
        lineHeight: parseFloat(style.lineHeight),
        clientHeight: element.clientHeight,
      };
    });
    expect(clampMetrics.lineClamp).toBe("2");
    expect(clampMetrics.overflowWrap).toBe("anywhere");
    expect(clampMetrics.clientHeight).toBeLessThanOrEqual(
      clampMetrics.lineHeight * 2 + 0.5
    );

    await card.click();
    const dialog = page.getByRole("dialog");
    const modalTitle = dialog
      .locator("h3")
      .filter({ hasText: legacyTitle })
      .first();
    await expect(modalTitle).toHaveText(legacyTitle);
    const modalClamp = await modalTitle.evaluate((element) => {
      return getComputedStyle(element).webkitLineClamp;
    });
    expect(modalClamp).not.toBe("2");
  });

  test("edit mode enforces the cap and rejects saving an overlong legacy title inline", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const project = await createBoardProject(userId);
    const legacyTitle = repeatToLength(
      "legacy overlong title written before the cap existed ",
      170
    );
    await createBoardTask({
      projectId: project.id,
      userId,
      title: legacyTitle,
      position: 0,
    });
    await page.goto(`/projects/${project.id}`);
    await ensureBoardExpanded(page);

    const card = page.locator('[data-kanban-task-card]', {
      hasText: legacyTitle,
    });
    await card.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Task options" }).click();
    await dialog.getByRole("button", { name: /^Edit$/ }).click();

    const titleInput = dialog.getByLabel("Task title");
    await expect(titleInput).toHaveValue(legacyTitle);
    expect(await titleInput.getAttribute("maxlength")).toBe("120");
    await expect(
      dialog.getByText(`${legacyTitle.length}/120 characters`, {
        exact: true,
      })
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(
      dialog.getByText("Task title must be 120 characters or fewer.")
    ).toBeVisible();
    await expect(titleInput).toBeVisible();
  });
});
