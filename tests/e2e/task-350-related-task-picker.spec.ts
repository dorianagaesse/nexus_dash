import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { TASK_STATUSES, type TaskStatus } from "../../lib/task-status";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const screenshotDirectory = process.env.TASK350_SCREENSHOT_DIR?.trim();

function candidateTitle(status: TaskStatus, index: number): string {
  return `${status} eligible candidate ${index}`;
}

test("related-task pickers expose and navigate every eligible mixed-status task", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("related-task-picker"),
      description: "Overflowing related-task picker coverage",
      ownerId: userId,
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: {
      id: true,
    },
  });
  const currentTask = await prisma.task.create({
    data: {
      title: "Current relationship task",
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: {
      id: true,
    },
  });

  await prisma.task.createMany({
    data: TASK_STATUSES.flatMap((status) =>
      Array.from({ length: 4 }, (_, index) => ({
        title: candidateTitle(status, index + 1),
        status,
        position: index,
        projectId: project.id,
        createdByUserId: userId,
        updatedByUserId: userId,
      }))
    ),
  });
  await prisma.task.create({
    data: {
      title: "Archived hidden candidate",
      status: "Done",
      archivedAt: new Date(),
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });
  await prisma.project.create({
    data: {
      name: uniqueProjectName("unrelated-project"),
      description: "Authorization boundary coverage",
      ownerId: userId,
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
      tasks: {
        create: {
          title: "Other project hidden candidate",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      },
    },
  });
  const outsider = await prisma.user.create({
    data: {
      email: `${uniqueProjectName("picker-outsider")}@nexusdash.local`,
      name: "Related-task outsider",
      emailVerified: new Date(),
    },
    select: {
      id: true,
    },
  });
  await prisma.project.create({
    data: {
      name: uniqueProjectName("unauthorized-project"),
      description: "Unauthorized project boundary coverage",
      ownerId: outsider.id,
      memberships: {
        create: {
          userId: outsider.id,
          role: "owner",
        },
      },
      tasks: {
        create: {
          title: "Unauthorized project hidden candidate",
          createdByUserId: outsider.id,
          updatedByUserId: outsider.id,
        },
      },
    },
  });

  await page.goto(`/projects/${project.id}?taskId=${currentTask.id}`);
  await expect(
    page.getByRole("button", { name: "Task options" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: /^Edit$/ }).click();

  const detailSearch = page.getByRole("combobox", {
    name: "Search related tasks",
  });
  await detailSearch.focus();
  const detailListbox = page.getByRole("listbox", {
    name: "Related task suggestions",
  });
  await expect(detailListbox).toBeVisible();
  await expect(detailListbox.getByRole("option")).toHaveCount(16);

  for (const status of TASK_STATUSES) {
    await expect(
      detailListbox.getByRole("option", {
        name: candidateTitle(status, 4),
        exact: true,
      })
    ).toBeAttached();
  }
  await expect(
    detailListbox.getByRole("option", { name: "Current relationship task" })
  ).toHaveCount(0);
  await expect(
    detailListbox.getByRole("option", { name: "Archived hidden candidate" })
  ).toHaveCount(0);
  await expect(
    detailListbox.getByRole("option", {
      name: "Other project hidden candidate",
    })
  ).toHaveCount(0);
  await expect(
    detailListbox.getByRole("option", {
      name: "Unauthorized project hidden candidate",
    })
  ).toHaveCount(0);

  const listMetrics = await detailListbox.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);

  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDirectory, "detail-picker-overflow.png"),
      fullPage: true,
    });
  }

  const detailScroller = page
    .getByRole("dialog")
    .locator("div.overflow-y-auto")
    .first();
  const detailScrollTop = await detailScroller.evaluate(
    (element) => element.scrollTop
  );
  await detailListbox.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => detailListbox.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await detailListbox.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => detailScroller.evaluate((element) => element.scrollTop))
    .toBe(detailScrollTop);

  if (screenshotDirectory) {
    await page.screenshot({
      path: path.join(screenshotDirectory, "detail-picker-final-result.png"),
      fullPage: true,
    });
  }

  await detailSearch.press("End");
  const activeOption = detailListbox.locator("[data-active='true']");
  await expect(activeOption).toHaveCount(1);
  await expect(activeOption).toBeInViewport();
  const finalTaskTitle = await activeOption.textContent();
  expect(finalTaskTitle).toBeTruthy();
  await detailSearch.press("Enter");
  await expect(
    page.getByRole("button", {
      name: `Remove related task ${finalTaskTitle}`,
    })
  ).toBeVisible();

  const blockedTaskTitle = candidateTitle("Blocked", 4);
  await detailSearch.fill(blockedTaskTitle);
  await expect(detailListbox.getByRole("option")).toHaveCount(1);
  await detailListbox
    .getByRole("option", { name: blockedTaskTitle, exact: true })
    .click();
  const saveRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/tasks\/[^/]+$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await saveRequest;
  await expect(page.getByText("Task saved.")).toBeVisible();
  await page.getByRole("button", { name: "Close task" }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "New task" }).click();
  const createSearch = page.getByRole("combobox", {
    name: "Search related tasks",
  });
  await createSearch.scrollIntoViewIfNeeded();
  await expect(createSearch).toBeInViewport();
  await createSearch.focus();
  const createListbox = page.getByRole("listbox", {
    name: "Related task suggestions",
  });
  await expect(createListbox.getByRole("option")).toHaveCount(17);

  const createPopoverBounds = await createListbox
    .locator("xpath=..")
    .boundingBox();
  expect(createPopoverBounds).not.toBeNull();
  expect(createPopoverBounds!.x).toBeGreaterThanOrEqual(0);
  expect(
    createPopoverBounds!.x + createPopoverBounds!.width
  ).toBeLessThanOrEqual(375);

  if (screenshotDirectory) {
    await page.screenshot({
      path: path.join(screenshotDirectory, "create-picker-narrow-overflow.png"),
    });
  }

  await createSearch.fill(blockedTaskTitle);
  await expect(createListbox.getByRole("option")).toHaveCount(1);
  const createBlockedOption = createListbox.getByRole("option", {
    name: blockedTaskTitle,
    exact: true,
  });
  const createBlockedOptionBounds = await createBlockedOption.boundingBox();
  expect(createBlockedOptionBounds).not.toBeNull();
  expect(createBlockedOptionBounds!.y).toBeGreaterThanOrEqual(0);
  expect(
    createBlockedOptionBounds!.y + createBlockedOptionBounds!.height
  ).toBeLessThanOrEqual(812);
  await createBlockedOption.click();
  await page.locator("#task-title").fill("Created with a below-fold relation");
  const createRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/tasks$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create task" }).click();
  await createRequest;
  await expect(
    page.getByRole("button", {
      name: /Created with a below-fold relation/,
    })
  ).toBeVisible();
});
