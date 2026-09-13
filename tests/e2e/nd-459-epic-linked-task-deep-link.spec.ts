import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { formatTaskReference } from "../../lib/task-reference";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

interface EpicChipTask {
  id: string;
  title: string;
  reference: string;
}

const EPIC_NAME = "Chip deep links";

async function createEpicChipFixture(page: Page): Promise<{
  projectId: string;
  activeTask: EpicChipTask;
  archivedTask: EpicChipTask;
}> {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd-459-epic-chips"),
      description: "Epic linked-task chip fixture.",
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
  const epic = await prisma.epic.create({
    data: {
      projectId: project.id,
      name: EPIC_NAME,
      description: "Cover linked-task references and deep links.",
    },
    select: { id: true },
  });

  const createTask = async (
    title: string,
    options: { archived?: boolean } = {}
  ): Promise<EpicChipTask> => {
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        epicId: epic.id,
        title,
        status: options.archived ? "Done" : "Backlog",
        completedAt: options.archived ? new Date() : null,
        archivedAt: options.archived ? new Date() : null,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      select: { id: true, title: true, referenceNumber: true },
    });

    return {
      id: task.id,
      title: task.title,
      reference: formatTaskReference(task.referenceNumber)!,
    };
  };

  return {
    projectId: project.id,
    activeTask: await createTask("ND-459 active linked task"),
    archivedTask: await createTask("ND-459 archived linked task", {
      archived: true,
    }),
  };
}

async function openEpicDetails(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}#epics`);
  const epic = page.getByRole("article", { name: EPIC_NAME });
  await epic
    .getByRole("button", { name: `Show details for ${EPIC_NAME}` })
    .click();
  return epic;
}

async function expectTaskDeepLink(
  page: Page,
  projectId: string,
  taskId: string
) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return url.pathname === `/projects/${projectId}`
        ? url.searchParams.get("taskId")
        : null;
    })
    .toBe(taskId);
}

test.describe("ND-459 epic linked-task chips", () => {
  test("shows ND- references and opens a linked task on click", async ({
    page,
  }) => {
    const fixture = await createEpicChipFixture(page);
    const epic = await openEpicDetails(page, fixture.projectId);

    const activeChip = epic.locator(
      `a[href="/projects/${fixture.projectId}/tasks/${fixture.activeTask.id}"]`
    );
    await expect(epic.getByRole("link")).toHaveCount(2);
    await expect(activeChip).toBeVisible();
    await expect(activeChip).toContainText(fixture.activeTask.reference);
    await expect(activeChip).toContainText(fixture.activeTask.title);
    await expect(activeChip).toContainText("Backlog");

    await activeChip.click();

    await expect(
      page.getByRole("dialog", { name: fixture.activeTask.title })
    ).toBeVisible();
    await expectTaskDeepLink(page, fixture.projectId, fixture.activeTask.id);

    await page.getByRole("button", { name: "Close task" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("opens an archived linked task by deep link", async ({ page }) => {
    const fixture = await createEpicChipFixture(page);
    const epic = await openEpicDetails(page, fixture.projectId);

    const archivedChip = epic.locator(
      `a[href="/projects/${fixture.projectId}/tasks/${fixture.archivedTask.id}"]`
    );
    await expect(archivedChip).toBeVisible();
    await expect(archivedChip).toContainText(fixture.archivedTask.reference);
    await expect(archivedChip).toContainText("Archived");

    await archivedChip.click();

    const dialog = page.getByRole("dialog", {
      name: fixture.archivedTask.title,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Archived", { exact: true })).toBeVisible();
    await expectTaskDeepLink(page, fixture.projectId, fixture.archivedTask.id);
  });

  test("opens a linked task from the keyboard", async ({ page }) => {
    const fixture = await createEpicChipFixture(page);
    const epic = await openEpicDetails(page, fixture.projectId);

    const activeChip = epic.locator(
      `a[href="/projects/${fixture.projectId}/tasks/${fixture.activeTask.id}"]`
    );
    await activeChip.focus();
    await expect(activeChip).toBeFocused();

    await activeChip.press("Enter");

    await expect(
      page.getByRole("dialog", { name: fixture.activeTask.title })
    ).toBeVisible();
    await expectTaskDeepLink(page, fixture.projectId, fixture.activeTask.id);
  });

  test("keeps linked-task chips compact on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const fixture = await createEpicChipFixture(page);
    const epic = await openEpicDetails(page, fixture.projectId);

    const activeChip = epic.locator(
      `a[href="/projects/${fixture.projectId}/tasks/${fixture.activeTask.id}"]`
    );
    await expect(activeChip).toBeVisible();
    await expect(activeChip).toContainText(fixture.activeTask.reference);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
});
