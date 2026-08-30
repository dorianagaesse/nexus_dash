import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { buildCanonicalTaskRelation } from "../../lib/task-related";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function createProject(userId: string, role: "owner" | "viewer" = "owner") {
  const ownerId =
    role === "owner"
      ? userId
      : (
          await prisma.user.create({
            data: {
              email: `${uniqueProjectName("task382-owner")}@nexusdash.local`,
              name: "TASK-382 Fixture Owner",
              emailVerified: new Date(),
            },
            select: { id: true },
          })
        ).id;

  return prisma.project.create({
    data: {
      name: uniqueProjectName("task382-project"),
      description: "Search and label filter browser fixture.",
      ownerId,
      memberships: {
        create: [
          { userId: ownerId, role: "owner" },
          ...(ownerId === userId ? [] : [{ userId, role }]),
        ],
      },
    },
    select: { id: true },
  });
}

async function openKanban(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}#kanban`);
  await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search tasks" })).toBeVisible();
}

async function searchTasks(page: Page, query: string) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      /\/tasks\/search$/.test(url.pathname) &&
      url.searchParams.get("q") === query
    );
  });
  await page.getByRole("searchbox", { name: "Search tasks" }).fill(query);
  expect((await responsePromise).ok()).toBe(true);
}

test.describe("TASK-382 Kanban search and label filters", () => {
  test("searches every task text source, isolates projects, recovers, and exposes archived matches", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, usernameDiscriminator: true },
    });
    const project = await createProject(userId);
    const epic = await prisma.epic.create({
      data: {
        projectId: project.id,
        name: "Aurora Initiative",
        description: "Search fixture epic.",
      },
      select: { id: true },
    });
    const relatedTask = await prisma.task.create({
      data: {
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        title: "Dependency target quartz",
        status: "Backlog",
        position: 0,
      },
      select: { id: true },
    });
    const searchableTask = await prisma.task.create({
      data: {
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        assigneeUserId: userId,
        epicId: epic.id,
        title: "Launch Comet Workspace",
        description: "<p>Keyboard nebula description</p>",
        status: "Blocked",
        position: 0,
        blockedNote: "Legacy approval orbit",
        labelsJson: JSON.stringify(["Frontend", "Urgent"]),
        comments: { create: { authorUserId: userId, content: "Comment supernova phrase" } },
        blockedFollowUps: { create: { content: "Follow up with design pulsar" } },
        attachments: {
          create: {
            uploadedByUserId: userId,
            kind: "link",
            name: "interaction-galaxy.pdf",
            url: "https://example.com/interaction-galaxy.pdf",
          },
        },
      },
      select: { id: true, referenceNumber: true },
    });
    await prisma.taskRelation.create({
      data: {
        projectId: project.id,
        ...buildCanonicalTaskRelation(searchableTask.id, relatedTask.id),
      },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        title: "Archived meteor task",
        status: "Done",
        position: 0,
        completedAt: new Date(),
        archivedAt: new Date(),
        comments: { create: { authorUserId: userId, content: "Archive eclipse phrase" } },
      },
    });
    const isolatedProject = await createProject(userId);
    await prisma.task.create({
      data: {
        projectId: isolatedProject.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        title: "Other project satellite secret",
        status: "Backlog",
        position: 0,
      },
    });

    await openKanban(page, project.id);
    const requiredQueries = [
      "LAUNCH COMET",
      "keyboard nebula",
      `nd-${searchableTask.referenceNumber}`,
      "blocked",
      "frontend",
      "comment supernova",
      "aurora initiative",
      "e2e smoke user",
      `${user.username}#${user.usernameDiscriminator}`,
      "legacy approval orbit",
      "design pulsar",
      "interaction-galaxy.pdf",
      "dependency target quartz",
    ];
    for (const query of requiredQueries) {
      await searchTasks(page, query);
      await expect(
        page.locator(`[data-kanban-task-id="${searchableTask.id}"]`)
      ).toBeVisible();
    }

    await searchTasks(page, "other project satellite secret");
    await expect(page.getByText("0 / 3 tasks", { exact: true })).toBeVisible();
    await expect(page.getByText(/No matching backlog tasks/)).toBeVisible();

    await searchTasks(page, "archive eclipse phrase");
    await expect(page.getByText("Archive (1)", { exact: true })).toBeVisible();
    await expect(page.getByText("Archived meteor task", { exact: true })).toBeVisible();

    let failNextSearch = true;
    await page.route(`**/api/projects/${project.id}/tasks/search?*`, async (route) => {
      if (failNextSearch) {
        failNextSearch = false;
        await route.fulfill({ status: 503, json: { error: "Search temporarily unavailable." } });
        return;
      }
      await route.continue();
    });
    await page.getByRole("searchbox", { name: "Search tasks" }).fill("launch comet");
    await expect(
      page.getByText(/previous results are still shown/)
    ).toBeVisible();
    await expect(page.getByText("Archived meteor task", { exact: true })).toBeVisible();
    const retryResponse = page.waitForResponse(
      (response) => /\/tasks\/search/.test(response.url()) && response.ok()
    );
    await page.getByRole("button", { name: "Retry" }).click();
    await retryResponse;
    await expect(
      page.locator(`[data-kanban-task-id="${searchableTask.id}"]`)
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear task search" }).click();
    await expect(page.getByText("3 / 3 tasks", { exact: true })).toBeVisible();
  });

  test("lets viewers combine label filters and toggle a card chip without opening it", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const project = await createProject(userId, "viewer");
    const both = await prisma.task.create({
      data: {
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        title: "Viewer both labels",
        status: "Backlog",
        position: 0,
        labelsJson: JSON.stringify(["Frontend", "Urgent"]),
      },
      select: { id: true },
    });
    await prisma.task.createMany({
      data: [
        {
          projectId: project.id,
          createdByUserId: userId,
          updatedByUserId: userId,
          title: "Viewer frontend only",
          status: "Backlog",
          position: 1,
          labelsJson: JSON.stringify(["Frontend"]),
        },
        {
          projectId: project.id,
          createdByUserId: userId,
          updatedByUserId: userId,
          title: "Viewer urgent only",
          status: "Backlog",
          position: 2,
          labelsJson: JSON.stringify(["Urgent"]),
        },
      ],
    });

    await openKanban(page, project.id);
    await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
    const toolbar = page.getByRole("region", { name: "Filter Kanban tasks" });
    await toolbar.getByRole("button", { name: "Frontend" }).click();
    await toolbar.getByRole("button", { name: "Urgent" }).click();
    await expect(page.getByText("1 / 3 tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Viewer both labels", { exact: true })).toBeVisible();
    await expect(page.getByText("Viewer frontend only", { exact: true })).toHaveCount(0);

    const card = page.locator(`[data-kanban-task-id="${both.id}"]`);
    await card.getByRole("button", { name: "Remove Urgent label filter" }).click();
    await expect(page.getByText("2 / 3 tasks", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close task" })).toHaveCount(0);
    await toolbar.getByRole("button", { name: "Clear labels" }).click();
    await expect(page.getByText("3 / 3 tasks", { exact: true })).toBeVisible();
  });

  test("maps keyboard and pointer drops around hidden interleaved cards", async ({
    page,
  }) => {
    const userId = await signInAsVerifiedUser(page);
    const project = await createProject(userId);
    const taskFixtures = [
        ["Visible source one", "Backlog", 0, true],
        ["Hidden backlog one", "Backlog", 1, false],
        ["Visible source two", "Backlog", 2, true],
        ["Hidden backlog two", "Backlog", 3, false],
        ["Visible source three", "Backlog", 4, true],
        ["Hidden progress one", "In Progress", 0, false],
        ["Visible progress anchor", "In Progress", 1, true],
        ["Hidden progress two", "In Progress", 2, false],
      ] as const;
    await prisma.task.createMany({
      data: taskFixtures.map(([title, status, position, visible]) => ({
            projectId: project.id,
            createdByUserId: userId,
            updatedByUserId: userId,
            title,
            status,
            position,
            labelsJson: visible ? JSON.stringify(["Visible"]) : null,
      })),
    });
    const seededRows = await prisma.task.findMany({
      where: { projectId: project.id },
      select: { id: true, title: true },
    });
    const seeded = new Map(seededRows.map((task) => [task.title, task]));

    await openKanban(page, project.id);
    await page
      .getByRole("region", { name: "Filter Kanban tasks" })
      .getByRole("button", { name: "Visible" })
      .click();

    const keyboardTaskId = seeded.get("Visible source one")?.id;
    const pointerTaskId = seeded.get("Visible source two")?.id;
    expect(keyboardTaskId).toBeTruthy();
    expect(pointerTaskId).toBeTruthy();
    const keyboardTask = page.locator(`[data-kanban-task-id="${keyboardTaskId}"]`);
    await keyboardTask.focus();
    const keyboardReorder = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/tasks\/reorder$/.test(response.url())
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    expect((await keyboardReorder).ok()).toBe(true);

    const pointerTask = page.locator(`[data-kanban-task-id="${pointerTaskId}"]`);
    const destinationLane = page.locator('[data-kanban-lane="In Progress"]');
    const sourceBounds = await pointerTask.boundingBox();
    const destinationBounds = await destinationLane.boundingBox();
    expect(sourceBounds).not.toBeNull();
    expect(destinationBounds).not.toBeNull();
    const pointerReorder = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/tasks\/reorder$/.test(response.url())
    );
    await page.mouse.move(
      sourceBounds!.x + sourceBounds!.width / 2,
      sourceBounds!.y + 20
    );
    await page.mouse.down();
    await page.mouse.move(sourceBounds!.x + 12, sourceBounds!.y + 28, { steps: 8 });
    await page.mouse.move(
      destinationBounds!.x + destinationBounds!.width / 2,
      destinationBounds!.y + 140,
      { steps: 24 }
    );
    await page.mouse.up();
    expect((await pointerReorder).ok()).toBe(true);

    const persisted = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { position: "asc" }],
      select: { title: true, status: true },
    });
    const hiddenBacklog = persisted
      .filter((task) => task.status === "Backlog" && task.title.startsWith("Hidden"))
      .map((task) => task.title);
    const hiddenProgress = persisted
      .filter((task) => task.status === "In Progress" && task.title.startsWith("Hidden"))
      .map((task) => task.title);
    expect(hiddenBacklog).toEqual(["Hidden backlog one", "Hidden backlog two"]);
    expect(hiddenProgress).toEqual(["Hidden progress one", "Hidden progress two"]);
  });

  test("keeps the filter surface contained at 375 px and mobile landscape in dark reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      window.localStorage.setItem("nexusdash-theme", "dark");
    });
    const userId = await signInAsVerifiedUser(page);
    const project = await createProject(userId);
    await prisma.task.create({
      data: {
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
        title: "Mobile constellation task",
        status: "Backlog",
        position: 0,
        labelsJson: JSON.stringify(["Accessibility"]),
      },
    });

    await openKanban(page, project.id);
    await expect(page.locator("html")).toHaveClass(/dark/);
    const labelButton = page
      .getByRole("region", { name: "Filter Kanban tasks" })
      .getByRole("button", { name: "Accessibility" });
    const labelBounds = await labelButton.boundingBox();
    expect(labelBounds?.height).toBeGreaterThanOrEqual(44);
    await labelButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1 / 1 tasks", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);

    await page.setViewportSize({ width: 667, height: 375 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);
    await expect(page.getByRole("searchbox", { name: "Search tasks" })).toBeVisible();
  });
});
