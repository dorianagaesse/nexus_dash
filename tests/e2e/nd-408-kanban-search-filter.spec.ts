import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import type { TaskStatus } from "../../lib/task-status";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function createBoardProject(ownerUserId: string) {
  return prisma.project.create({
    data: {
      name: uniqueProjectName("nd408-filter"),
      description: "Unified Kanban search and filter coverage",
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

async function createBoardEpic(projectId: string, name: string) {
  return prisma.epic.create({
    data: {
      projectId,
      name,
      description: `${name} coverage epic`,
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
  status?: TaskStatus;
  position: number;
  labels?: string[];
  epicId?: string | null;
  archived?: boolean;
}) {
  return prisma.task.create({
    data: {
      title: input.title,
      projectId: input.projectId,
      status: input.status ?? "Backlog",
      position: input.position,
      labelsJson:
        input.labels && input.labels.length > 0
          ? JSON.stringify(input.labels)
          : null,
      epicId: input.epicId ?? null,
      archivedAt: input.archived ? new Date() : null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
    },
    select: {
      id: true,
    },
  });
}

function columnCards(page: import("@playwright/test").Page, status: string) {
  return page.locator(
    `[data-kanban-dropzone="${status}"] [data-kanban-task-card]`
  );
}

function visibleCardIds(
  page: import("@playwright/test").Page,
  status: string
): Promise<(string | null)[]> {
  return columnCards(page, status).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-kanban-task-card"))
  );
}

async function openFilterPanel(
  page: import("@playwright/test").Page
): Promise<import("@playwright/test").Locator> {
  const trigger = page.getByRole("button", { name: /^Filter/ });
  await trigger.click();
  const panel = page.locator("#kanban-filter-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function togglePanelOption(
  page: import("@playwright/test").Page,
  optionName: string
) {
  const panel = page.locator("#kanban-filter-panel");
  await panel.getByRole("button", { name: optionName, exact: true }).click();
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

test("combines search, label, epic, and No epic filters with archived auto-open and project isolation", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await createBoardProject(userId);
  const epicAlpha = await createBoardEpic(project.id, "Epic Alpha");
  const epicBeta = await createBoardEpic(project.id, "Epic Beta");
  const alphaPrep = await createBoardTask({
    projectId: project.id,
    userId,
    title: "Alpha prep launch",
    position: 0,
    labels: ["Frontend", "Urgent"],
    epicId: epicAlpha.id,
  });
  const betaPrep = await createBoardTask({
    projectId: project.id,
    userId,
    title: "Beta prep review",
    position: 1,
    labels: ["Frontend"],
    epicId: epicBeta.id,
  });
  await createBoardTask({
    projectId: project.id,
    userId,
    title: "Gamma cleanup day",
    position: 2,
  });
  await createBoardTask({
    projectId: project.id,
    userId,
    title: "Delta archive month",
    status: "Done",
    position: 0,
    labels: ["Frontend"],
    archived: true,
  });
  const foreignProject = await createBoardProject(userId);
  const foreignEpic = await createBoardEpic(foreignProject.id, "Epic Foreign");
  await createBoardTask({
    projectId: foreignProject.id,
    userId,
    title: "Alpha prep foreign",
    position: 0,
    labels: ["Frontend"],
    epicId: foreignEpic.id,
  });

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);

  const search = page.getByRole("searchbox", { name: "Search tasks" });
  await search.fill("prep");

  await expect(columnCards(page, "Backlog")).toHaveCount(2);
  await expect(
    page.locator(`[data-kanban-task-card="${alphaPrep.id}"]`)
  ).toBeVisible();
  await expect(
    page.locator(`[data-kanban-task-card="${betaPrep.id}"]`)
  ).toBeVisible();

  await search.fill("prep foreign");
  await expect(columnCards(page, "Backlog")).toHaveCount(0);
  await expect(page.getByText("No matching backlog tasks")).toBeVisible();
  await expect(page.getByText("Alpha prep foreign")).toHaveCount(0);

  const panel = await openFilterPanel(page);
  await expect(
    panel.locator('[role="group"][aria-label="Labels"]')
  ).toBeVisible();
  await expect(
    panel.locator('[role="group"][aria-label="Epics"]')
  ).toBeVisible();

  await search.fill("prep");
  await togglePanelOption(page, "Frontend");
  await togglePanelOption(page, "Urgent");
  await togglePanelOption(page, "Epic Beta");
  await togglePanelOption(page, "No epic");
  await expect(columnCards(page, "Backlog")).toHaveCount(0);
  await expect(page.getByText("No matching backlog tasks")).toBeVisible();

  await togglePanelOption(page, "Urgent");
  await expect(columnCards(page, "Backlog")).toHaveCount(1);
  await expect(
    page.locator(`[data-kanban-task-card="${betaPrep.id}"]`)
  ).toBeVisible();
  await expect(
    page.locator(`[data-kanban-task-card="${alphaPrep.id}"]`)
  ).toHaveCount(0);

  await search.fill("archive");
  const archiveDetails = page.locator(`[data-kanban-status="Done"] details`);
  await expect(archiveDetails).toHaveAttribute("open", "");
  await expect(archiveDetails.getByText("Delta archive month")).toBeVisible();
  await expect(page.locator(`[data-kanban-status="Done"] details`)).toHaveCount(1);

  await search.fill("");
  const clearSearchButton = page.getByRole("button", { name: "Clear search" });
  await expect(clearSearchButton).toHaveCount(0);

  await panel.getByRole("button", { name: "Clear all filters" }).click();
  await expect(panel).toHaveCount(0);
  await expect(columnCards(page, "Backlog")).toHaveCount(3);
  await expect(page.getByText("No matching backlog tasks")).toHaveCount(0);

  const filterSurface = page.getByRole("region", {
    name: "Search and filter Kanban tasks",
  });
  await expect(
    filterSurface.getByText(/^\d+\s*\/\s*\d+\s*tasks?/)
  ).toHaveCount(0);
});

test("epic filters match any selected epic including No epic", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await createBoardProject(userId);
  const epicAlpha = await createBoardEpic(project.id, "Epic Alpha");
  const epicBeta = await createBoardEpic(project.id, "Epic Beta");
  const epicGamma = await createBoardEpic(project.id, "Epic Gamma");
  const arcOne = await createBoardTask({
    projectId: project.id,
    userId,
    title: "Arc one task",
    position: 0,
    epicId: epicAlpha.id,
  });
  const arcTwo = await createBoardTask({
    projectId: project.id,
    userId,
    title: "Arc two task",
    position: 1,
    epicId: epicBeta.id,
  });
  const arcNone = await createBoardTask({
    projectId: project.id,
    userId,
    title: "Arc none task",
    position: 2,
  });
  await createBoardTask({
    projectId: project.id,
    userId,
    title: "Arc other task",
    position: 3,
    epicId: epicGamma.id,
  });

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);

  await openFilterPanel(page);
  await togglePanelOption(page, "Epic Alpha");
  await togglePanelOption(page, "No epic");

  await expect(columnCards(page, "Backlog")).toHaveCount(2);
  await expect(
    page.locator(`[data-kanban-task-card="${arcOne.id}"]`)
  ).toBeVisible();
  await expect(
    page.locator(`[data-kanban-task-card="${arcNone.id}"]`)
  ).toBeVisible();
  await expect(
    page.locator(`[data-kanban-task-card="${arcTwo.id}"]`)
  ).toHaveCount(0);
});

test("pointer drag under a label filter keeps hidden tasks in order", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await createBoardProject(userId);
  const epic = await createBoardEpic(project.id, "Epic Alpha");

  const seeds = [
    { id: "h0", label: "Ops", title: "Hinge zero task" },
    { id: "v1", label: "Urgent", title: "Visible one task" },
    { id: "h2", label: "Ops", title: "Hinge two task" },
    { id: "v3", label: "Urgent", title: "Visible three task" },
    { id: "h4", label: "Ops", title: "Hinge four task" },
    { id: "v5", label: "Urgent", title: "Visible five task" },
  ] as const;
  const created = new Map<string, string>();
  for (const [index, seed] of seeds.entries()) {
    const task = await createBoardTask({
      projectId: project.id,
      userId,
      title: seed.title,
      status: "In Progress",
      position: index,
      labels: [seed.label],
      epicId: epic.id,
    });
    created.set(seed.id, task.id);
  }

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);

  await openFilterPanel(page);
  await togglePanelOption(page, "Urgent");

  await expect(columnCards(page, "In Progress")).toHaveCount(3);

  const dropzone = page.locator('[data-kanban-dropzone="In Progress"]');
  const dropzoneBox = (await dropzone.boundingBox())!;
  const visibleThree = page.locator(
    `[data-kanban-task-card="${created.get("v3")}"]`
  );
  const visibleThreeBox = (await visibleThree.boundingBox())!;

  await page.mouse.move(
    visibleThreeBox.x + visibleThreeBox.width / 2,
    visibleThreeBox.y + visibleThreeBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    dropzoneBox.x + dropzoneBox.width / 2,
    dropzoneBox.y + dropzoneBox.height - 8,
    { steps: 24 }
  );
  await page.mouse.up();

  const expectedOrder = [
    created.get("h0")!,
    created.get("v1")!,
    created.get("h2")!,
    created.get("h4")!,
    created.get("v5")!,
    created.get("v3")!,
  ];
  await expect
    .poll(async () => {
      const rows = await prisma.task.findMany({
        where: { projectId: project.id, status: "In Progress" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      return rows.map((row) => row.id);
    })
    .toEqual(expectedOrder);

  await page.reload();
  await ensureBoardExpanded(page);
  expect(await visibleCardIds(page, "In Progress")).toEqual(expectedOrder);
});

test("keyboard drag under a label filter drops relative to visible tasks", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await createBoardProject(userId);
  const epic = await createBoardEpic(project.id, "Epic Alpha");

  const seeds = [
    { id: "h0", label: "Ops", title: "Hinge zero task" },
    { id: "v1", label: "Urgent", title: "Visible one task" },
    { id: "h2", label: "Ops", title: "Hinge two task" },
    { id: "v3", label: "Urgent", title: "Visible three task" },
    { id: "h4", label: "Ops", title: "Hinge four task" },
    { id: "v5", label: "Urgent", title: "Visible five task" },
  ] as const;
  const created = new Map<string, string>();
  for (const [index, seed] of seeds.entries()) {
    const task = await createBoardTask({
      projectId: project.id,
      userId,
      title: seed.title,
      status: "In Progress",
      position: index,
      labels: [seed.label],
      epicId: epic.id,
    });
    created.set(seed.id, task.id);
  }

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);

  await openFilterPanel(page);
  await togglePanelOption(page, "Urgent");

  const inProgressCards = columnCards(page, "In Progress");
  await expect(inProgressCards).toHaveCount(3);

  const visibleOne = page.locator(
    `[data-kanban-task-card="${created.get("v1")}"]`
  );
  await visibleOne.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  const expectedOrder = [
    created.get("h0")!,
    created.get("h2")!,
    created.get("v3")!,
    created.get("h4")!,
    created.get("v1")!,
    created.get("v5")!,
  ];
  await expect
    .poll(async () => {
      const rows = await prisma.task.findMany({
        where: { projectId: project.id, status: "In Progress" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      return rows.map((row) => row.id);
    })
    .toEqual(expectedOrder);
});

test("viewers filter the board but get no create or drag affordances", async ({
  page,
}) => {
  const owner = await prisma.user.create({
    data: {
      email: `${uniqueProjectName("nd408-owner")}@nexusdash.local`,
      name: "ND-408 Board Owner",
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  const viewerUserId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd408-viewer"),
      description: "Viewer board coverage",
      ownerId: owner.id,
      memberships: {
        create: [
          {
            userId: owner.id,
            role: "owner",
          },
          {
            userId: viewerUserId,
            role: "viewer",
          },
        ],
      },
    },
    select: { id: true },
  });
  const urgentTask = await createBoardTask({
    projectId: project.id,
    userId: owner.id,
    title: "Viewer urgent task",
    position: 0,
    labels: ["Urgent"],
  });
  await createBoardTask({
    projectId: project.id,
    userId: owner.id,
    title: "Viewer ops task",
    position: 1,
    labels: ["Ops"],
  });

  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);

  await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);

  const firstCard = page.locator(
    `[data-kanban-task-card="${urgentTask.id}"]`
  );
  await expect(firstCard).toBeVisible();
  await expect(firstCard).not.toHaveClass(/cursor-grab/);
  await expect(firstCard.locator(".lucide-grip-vertical")).toHaveCount(0);

  await openFilterPanel(page);
  await togglePanelOption(page, "Urgent");
  await expect(columnCards(page, "Backlog")).toHaveCount(1);
  await expect(
    page.locator(`[data-kanban-task-card="${urgentTask.id}"]`)
  ).toBeVisible();

  const urgentBox = (await firstCard.boundingBox())!;
  await page.mouse.move(
    urgentBox.x + urgentBox.width / 2,
    urgentBox.y + urgentBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(urgentBox.x + urgentBox.width / 2, urgentBox.y + 160, {
    steps: 12,
  });
  await page.mouse.up();

  const persistedPositions = await prisma.task.findMany({
    where: { projectId: project.id },
    orderBy: [{ position: "asc" }],
    select: { id: true, title: true },
  });
  expect(persistedPositions.map((task) => task.title)).toEqual([
    "Viewer urgent task",
    "Viewer ops task",
  ]);
});

test("filter panel stays on-screen and horizontal-scroll free at 375px, landscape, and dark mode", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await createBoardProject(userId);
  await createBoardEpic(project.id, "Epic Alpha");
  await createBoardEpic(project.id, "Epic Beta");
  await createBoardTask({
    projectId: project.id,
    userId,
    title: "Responsive task one",
    position: 0,
    labels: ["Frontend", "Urgent", "Accessibility", "Long-label"],
  });
  await createBoardTask({
    projectId: project.id,
    userId,
    title: "Responsive task two",
    position: 1,
    labels: ["Urgent"],
  });

  async function assertNoHorizontalScroll() {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        doc: doc.scrollWidth - doc.clientWidth,
        body: body.scrollWidth - body.clientWidth,
      };
    });
    expect(overflow.doc).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);
  }

  async function assertPanelInsideViewport() {
    const panelBox = (await page.locator("#kanban-filter-panel").boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(panelBox.y).toBeGreaterThanOrEqual(0);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(
      viewport.height + 1
    );
  }

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/projects/${project.id}`);
  await ensureBoardExpanded(page);
  await assertNoHorizontalScroll();

  const panel = await openFilterPanel(page);
  await assertPanelInsideViewport();
  await expect(panel.getByRole("button", { name: "Frontend" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "No epic" })).toBeVisible();

  await page.evaluate(() => {
    window.localStorage.setItem("nexusdash-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(panel.getByRole("button", { name: "Frontend" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "No epic" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#kanban-filter-panel")).toHaveCount(0);

  await page.setViewportSize({ width: 667, height: 375 });
  await assertNoHorizontalScroll();
  await openFilterPanel(page);
  await assertPanelInsideViewport();
  await expect(panel.getByRole("button", { name: "No epic" })).toBeVisible();
});
