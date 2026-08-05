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
        name: new RegExp(`${candidateTitle(status, 4)}, ${status}$`),
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
    element.scrollTop = 22;
  });
  const detailListboxBounds = await detailListbox.boundingBox();
  expect(detailListboxBounds).not.toBeNull();
  await page.mouse.move(
    detailListboxBounds!.x + detailListboxBounds!.width / 2,
    detailListboxBounds!.y + 2
  );
  await page.mouse.move(
    detailListboxBounds!.x + detailListboxBounds!.width / 2,
    detailListboxBounds!.y + detailListboxBounds!.height - 2
  );
  await expect
    .poll(() => detailListbox.evaluate((element) => element.scrollTop))
    .toBe(22);

  await page.mouse.wheel(0, 600);
  let detailListScrollTop = 0;
  await expect
    .poll(async () => {
      detailListScrollTop = await detailListbox.evaluate(
        (element) => element.scrollTop
      );
      return detailListScrollTop;
    })
    .toBeGreaterThan(22);
  await page.mouse.wheel(0, -600);
  await expect
    .poll(() => detailListbox.evaluate((element) => element.scrollTop))
    .toBeLessThan(detailListScrollTop);

  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() =>
      detailListbox.evaluate(
        (element) =>
          element.scrollTop >= element.scrollHeight - element.clientHeight - 1
      )
    )
    .toBe(true);
  await expect
    .poll(() => detailScroller.evaluate((element) => element.scrollTop))
    .toBe(detailScrollTop);
  const detailFinalOption = detailListbox.getByRole("option").last();
  await expect(detailFinalOption).toBeVisible();
  expect(
    await detailListbox.evaluate((listbox) => {
      const option = listbox.querySelector<HTMLElement>(
        "[role='option']:last-of-type"
      );
      if (!option) {
        return false;
      }
      const optionRect = option.getBoundingClientRect();
      const listboxRect = listbox.getBoundingClientRect();
      return (
        optionRect.top >= listboxRect.top &&
        optionRect.bottom <= listboxRect.bottom
      );
    })
  ).toBe(true);

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
  const finalTaskTitle = await activeOption.getAttribute("data-task-title");
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
    .getByRole("option", {
      name: new RegExp(`${blockedTaskTitle}, Blocked$`),
    })
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

  const createScroller = page
    .getByRole("dialog")
    .locator("div.overflow-y-auto")
    .first();
  const createScrollTop = await createScroller.evaluate(
    (element) => element.scrollTop
  );
  const createListboxBounds = await createListbox.boundingBox();
  expect(createListboxBounds).not.toBeNull();
  await page.mouse.move(
    createListboxBounds!.x + createListboxBounds!.width / 2,
    createListboxBounds!.y + createListboxBounds!.height / 2
  );
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() =>
      createListbox.evaluate(
        (element) =>
          element.scrollTop >= element.scrollHeight - element.clientHeight - 1
      )
    )
    .toBe(true);
  await expect
    .poll(() => createScroller.evaluate((element) => element.scrollTop))
    .toBe(createScrollTop);
  const createFinalOption = createListbox.getByRole("option").last();
  await expect(createFinalOption).toBeVisible();
  expect(
    await createListbox.evaluate((listbox) => {
      const option = listbox.querySelector<HTMLElement>(
        "[role='option']:last-of-type"
      );
      if (!option) {
        return false;
      }
      const optionRect = option.getBoundingClientRect();
      const listboxRect = listbox.getBoundingClientRect();
      return (
        optionRect.top >= listboxRect.top &&
        optionRect.bottom <= listboxRect.bottom
      );
    })
  ).toBe(true);

  if (screenshotDirectory) {
    await page.screenshot({
      path: path.join(screenshotDirectory, "create-picker-narrow-overflow.png"),
    });
  }

  await createSearch.fill(blockedTaskTitle);
  await expect(createListbox.getByRole("option")).toHaveCount(1);
  const createBlockedOption = createListbox.getByRole("option", {
    name: new RegExp(`${blockedTaskTitle}, Blocked$`),
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
