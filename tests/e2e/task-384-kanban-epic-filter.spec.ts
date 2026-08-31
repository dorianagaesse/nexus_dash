import { expect, test, type Locator, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const TITLES = {
  hiddenBacklogBefore: "Beta hidden backlog before",
  pointerSource: "Alpha pointer source",
  hiddenBacklogMiddle: "Beta hidden backlog middle",
  keyboardSource: "Alpha keyboard source",
  noEpic: "Unassigned planning task",
  hiddenDestinationBefore: "Beta hidden destination before",
  alphaAnchor: "Alpha visible destination anchor",
  hiddenDestinationAfter: "Beta hidden destination after",
  betaBlocked: "Beta blocked task",
  alphaDone: "Alpha completed task",
  alphaArchived: "Alpha archived result",
  betaArchived: "Beta archived result",
} as const;

async function createEpicFilterFixture(actorUserId: string) {
  const project = await prisma.project.create({
    data: {
      ownerId: actorUserId,
      name: uniqueProjectName("task-384-epic-filter"),
      description: "TASK-384 Epic filter browser coverage.",
      memberships: {
        create: {
          userId: actorUserId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });
  const [alphaEpic, betaEpic, gammaEpic] = await Promise.all([
    prisma.epic.create({
      data: {
        projectId: project.id,
        name: "Alpha launch",
        description: "Alpha initiative",
      },
      select: { id: true, name: true },
    }),
    prisma.epic.create({
      data: {
        projectId: project.id,
        name: "Beta readiness",
        description: "Beta initiative",
      },
      select: { id: true, name: true },
    }),
    prisma.epic.create({
      data: {
        projectId: project.id,
        name: "Gamma empty",
        description: "Epic with no tasks",
      },
      select: { id: true, name: true },
    }),
  ]);

  const taskData = [
    [TITLES.hiddenBacklogBefore, "Backlog", 0, betaEpic.id, null],
    [TITLES.pointerSource, "Backlog", 1, alphaEpic.id, null],
    [TITLES.hiddenBacklogMiddle, "Backlog", 2, betaEpic.id, null],
    [TITLES.keyboardSource, "Backlog", 3, alphaEpic.id, null],
    [TITLES.noEpic, "Backlog", 4, null, null],
    [TITLES.hiddenDestinationBefore, "In Progress", 0, betaEpic.id, null],
    [TITLES.alphaAnchor, "In Progress", 1, alphaEpic.id, null],
    [TITLES.hiddenDestinationAfter, "In Progress", 2, betaEpic.id, null],
    [TITLES.betaBlocked, "Blocked", 0, betaEpic.id, null],
    [TITLES.alphaDone, "Done", 0, alphaEpic.id, null],
    [TITLES.alphaArchived, "Done", 1, alphaEpic.id, new Date()],
    [TITLES.betaArchived, "Done", 2, betaEpic.id, new Date()],
  ] as const;

  for (const [title, status, position, epicId, archivedAt] of taskData) {
    await prisma.task.create({
      data: {
        projectId: project.id,
        title,
        status,
        position,
        epicId,
        archivedAt,
        completedAt: status === "Done" ? new Date() : null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });
  }

  const foreignProject = await prisma.project.create({
    data: {
      ownerId: actorUserId,
      name: uniqueProjectName("task-384-foreign"),
      memberships: {
        create: { userId: actorUserId, role: "owner" },
      },
    },
    select: { id: true },
  });
  const foreignEpic = await prisma.epic.create({
    data: {
      projectId: foreignProject.id,
      name: "Foreign project Epic",
      description: "Must not cross the project boundary.",
    },
    select: { id: true },
  });
  await prisma.task.create({
    data: {
      projectId: foreignProject.id,
      title: "Foreign project task",
      status: "Backlog",
      epicId: foreignEpic.id,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });

  return {
    projectId: project.id,
    alphaEpic,
    betaEpic,
    gammaEpic,
    totalTaskCount: taskData.length,
  };
}

function epicFilter(page: Page, name: string) {
  return page.getByRole("button", {
    name: `Filter tasks by Epic: ${name}`,
  });
}

function taskCard(page: Page, title: string): Locator {
  return page.locator("[data-kanban-task-card]").filter({ hasText: title });
}

async function dragToEnd(source: Locator, destination: Locator, page: Page) {
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(destinationBox).not.toBeNull();

  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + Math.min(24, sourceBox!.height / 2)
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2 + 8,
    sourceBox!.y + Math.min(24, sourceBox!.height / 2) + 8,
    { steps: 4 }
  );
  await page.mouse.move(
    destinationBox!.x + destinationBox!.width / 2,
    destinationBox!.y + destinationBox!.height - 18,
    { steps: 12 }
  );
  await page.mouse.up();
}

test.describe("TASK-384 Kanban Epic filters", () => {
  test("combines Epics and No epic, exposes archive results, clears, and contains responsive themes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const userId = await signInAsVerifiedUser(page);
    const fixture = await createEpicFilterFixture(userId);
    await page.addInitScript(() => {
      window.localStorage.setItem("nexusdash-theme", "light");
    });

    await page.goto(`/projects/${fixture.projectId}#kanban`);

    const filterSurface = page.locator('[data-kanban-epic-filter="true"]');
    await expect(filterSurface).toBeVisible();
    await expect(filterSurface.getByText("12 / 12 tasks shown")).toBeVisible();
    await expect(epicFilter(page, fixture.alphaEpic.name)).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await expect(epicFilter(page, fixture.betaEpic.name)).toBeVisible();
    await expect(epicFilter(page, fixture.gammaEpic.name)).toBeVisible();
    await expect(epicFilter(page, "No epic")).toBeVisible();
    await expect(page.getByText("Foreign project Epic")).toHaveCount(0);
    await expect(page.getByText("Foreign project task")).toHaveCount(0);

    await epicFilter(page, fixture.alphaEpic.name).click();
    await expect(epicFilter(page, fixture.alphaEpic.name)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(filterSurface.getByText("5 / 12 tasks shown")).toBeVisible();
    await expect(taskCard(page, TITLES.pointerSource)).toBeVisible();
    await expect(taskCard(page, TITLES.hiddenBacklogBefore)).toHaveCount(0);

    await epicFilter(page, fixture.betaEpic.name).click();
    await expect(filterSurface.getByText("11 / 12 tasks shown")).toBeVisible();
    await expect(taskCard(page, TITLES.hiddenBacklogBefore)).toBeVisible();
    await epicFilter(page, fixture.betaEpic.name).click();
    await expect(filterSurface.getByText("5 / 12 tasks shown")).toBeVisible();

    const archiveDetails = page
      .locator("details")
      .filter({ has: page.getByText("Archive (1)", { exact: true }) });
    await expect(archiveDetails).toHaveAttribute("open", "");
    await expect(
      archiveDetails.getByText(TITLES.alphaArchived, { exact: true })
    ).toBeVisible();
    await expect(
      archiveDetails.getByText(TITLES.betaArchived, { exact: true })
    ).toHaveCount(0);

    await epicFilter(page, "No epic").click();
    await expect(filterSurface.getByText("6 / 12 tasks shown")).toBeVisible();
    await expect(taskCard(page, TITLES.noEpic)).toBeVisible();
    await expect(filterSurface.getByText("2 Epic filters active")).toBeVisible();

    await epicFilter(page, fixture.alphaEpic.name).click();
    await expect(filterSurface.getByText("1 / 12 tasks shown")).toBeVisible();
    await expect(taskCard(page, TITLES.noEpic)).toBeVisible();
    await expect(taskCard(page, TITLES.pointerSource)).toHaveCount(0);

    await filterSurface.getByRole("button", { name: "Clear Epics" }).click();
    await expect(filterSurface.getByText("12 / 12 tasks shown")).toBeVisible();

    await epicFilter(page, fixture.gammaEpic.name).click();
    await expect(filterSurface.getByText("0 / 12 tasks shown")).toBeVisible();
    await expect(page.getByText("No Backlog tasks match these Epic filters")).toBeVisible();
    await filterSurface
      .getByRole("button", { name: "Clear all filters" })
      .click();
    await expect(filterSurface.getByText("12 / 12 tasks shown")).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(filterSurface).toBeVisible();
    const noEpicButton = epicFilter(page, "No epic");
    const noEpicBounds = await noEpicButton.boundingBox();
    expect(noEpicBounds).not.toBeNull();
    expect(noEpicBounds!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(filterSurface).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);

    await page.setViewportSize({ width: 812, height: 375 });
    await expect(filterSurface).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);
  });

  test("keeps filters available to viewers without exposing drag or create controls", async ({
    page,
  }) => {
    const viewerUserId = await signInAsVerifiedUser(page);
    const owner = await prisma.user.create({
      data: {
        email: `${uniqueProjectName("task384-owner")}@nexusdash.local`,
        name: "TASK-384 Owner",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: uniqueProjectName("task-384-viewer"),
        memberships: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: viewerUserId, role: "viewer" },
          ],
        },
      },
      select: { id: true },
    });
    const epic = await prisma.epic.create({
      data: {
        projectId: project.id,
        name: "Viewer-visible Epic",
        description: "Read-only filter coverage.",
      },
      select: { id: true, name: true },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Viewer-visible task",
        epicId: epic.id,
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
      },
    });

    await page.goto(`/projects/${project.id}#kanban`);
    await epicFilter(page, epic.name).click();

    await expect(page.getByText("1 / 1 tasks shown")).toBeVisible();
    await expect(taskCard(page, "Viewer-visible task")).toBeVisible();
    await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
    await expect(page.getByLabel("Drag task")).toHaveCount(0);
  });

  test("maps filtered pointer and keyboard drops into complete persisted columns", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const userId = await signInAsVerifiedUser(page);
    const fixture = await createEpicFilterFixture(userId);
    await page.goto(`/projects/${fixture.projectId}#kanban`);
    await epicFilter(page, fixture.alphaEpic.name).click();

    const pointerSource = taskCard(page, TITLES.pointerSource);
    const inProgressDropzone = page.locator(
      '[data-kanban-dropzone="In Progress"]'
    );
    const pointerReorder = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/projects/${fixture.projectId}/tasks/reorder`) &&
        response.ok()
    );
    await dragToEnd(pointerSource, inProgressDropzone, page);
    await pointerReorder;

    await expect(
      page.locator('[data-kanban-status="In Progress"]')
    ).toContainText(TITLES.pointerSource);
    await expect
      .poll(async () => {
        const tasks = await prisma.task.findMany({
          where: { projectId: fixture.projectId, status: "In Progress" },
          orderBy: { position: "asc" },
          select: { title: true },
        });
        return tasks.map(({ title }) => title);
      })
      .toEqual([
        TITLES.hiddenDestinationBefore,
        TITLES.alphaAnchor,
        TITLES.pointerSource,
        TITLES.hiddenDestinationAfter,
      ]);

    const keyboardSource = taskCard(page, TITLES.keyboardSource);
    await keyboardSource.focus();
    const keyboardReorder = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/projects/${fixture.projectId}/tasks/reorder`) &&
        response.ok()
    );
    await keyboardSource.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await keyboardReorder;

    await expect
      .poll(async () => {
        const tasks = await prisma.task.findMany({
          where: { projectId: fixture.projectId, status: "In Progress" },
          orderBy: { position: "asc" },
          select: { title: true },
        });
        return tasks.map(({ title }) => title);
      })
      .toEqual([
        TITLES.hiddenDestinationBefore,
        TITLES.keyboardSource,
        TITLES.alphaAnchor,
        TITLES.pointerSource,
        TITLES.hiddenDestinationAfter,
      ]);

    const hiddenBacklogOrder = await prisma.task.findMany({
      where: { projectId: fixture.projectId, status: "Backlog" },
      orderBy: { position: "asc" },
      select: { title: true },
    });
    expect(hiddenBacklogOrder.map(({ title }) => title)).toEqual([
      TITLES.hiddenBacklogBefore,
      TITLES.hiddenBacklogMiddle,
      TITLES.noEpic,
    ]);
  });
});
