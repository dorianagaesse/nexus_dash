import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { formatTaskReference } from "../../lib/task-reference";
import { TASK_STATUSES, type TaskStatus } from "../../lib/task-status";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const screenshotDirectory = process.env.TASK352_SCREENSHOT_DIR?.trim();
const LONG_TITLE =
  "A deliberately long related-task title that stays identifiable while its visible candidate row truncates cleanly";

function candidateTitle(status: TaskStatus): string {
  return status === "Backlog"
    ? LONG_TITLE
    : `${status} presentation candidate`;
}

test("related-task candidates present accessible IDs, bounded titles, and themed statuses", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("related-task-presentation"),
      description: "Related-task picker presentation coverage",
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
      title: "Current presentation task",
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: {
      id: true,
    },
  });
  const candidates = await Promise.all(
    TASK_STATUSES.map((status, position) =>
      prisma.task.create({
        data: {
          title: candidateTitle(status),
          status,
          position,
          projectId: project.id,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        select: {
          referenceNumber: true,
          status: true,
          title: true,
        },
      })
    )
  );

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/projects/${project.id}?taskId=${currentTask.id}`);
  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: /^Edit$/ }).click();

  const search = page.getByRole("combobox", {
    name: "Search related tasks",
  });
  await search.scrollIntoViewIfNeeded();
  await search.focus();
  const listbox = page.getByRole("listbox", {
    name: "Related task suggestions",
  });
  await expect(listbox.getByRole("option")).toHaveCount(TASK_STATUSES.length);

  const themeColors = new Map<string, string[]>();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => {
      window.localStorage.setItem("nexusdash-theme", nextTheme);
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
    }, theme);
    await expect(page.locator("html")).toHaveClass(
      theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/
    );

    const statusColors: string[] = [];
    for (const candidate of candidates) {
      const reference = formatTaskReference(candidate.referenceNumber)!;
      const option = listbox.getByRole("option", {
        name: `${reference}, ${candidate.title}, ${candidate.status}`,
        exact: true,
      });
      const title = option.locator(`[title="${candidate.title}"]`);
      const statusBadge = option.locator(
        "[data-task-status-badge='true']"
      );

      await expect(option).toBeVisible();
      await expect(option).toHaveAttribute(
        "aria-label",
        `${reference}, ${candidate.title}, ${candidate.status}`
      );
      await expect(title).toHaveAttribute("title", candidate.title);
      await expect(statusBadge).toHaveText(candidate.status);

      const optionBounds = await option.boundingBox();
      expect(optionBounds).not.toBeNull();
      expect(optionBounds!.height).toBeGreaterThanOrEqual(44);
      expect(optionBounds!.x).toBeGreaterThanOrEqual(0);
      expect(optionBounds!.x + optionBounds!.width).toBeLessThanOrEqual(375);
      expect(
        await option.evaluate(
          (element) => element.scrollWidth <= element.clientWidth
        )
      ).toBe(true);

      statusColors.push(
        await statusBadge.evaluate(
          (element) => window.getComputedStyle(element).backgroundColor
        )
      );
    }

    expect(new Set(statusColors).size).toBe(TASK_STATUSES.length);
    themeColors.set(theme, statusColors);

    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: path.join(
          screenshotDirectory,
          `related-task-picker-${theme}-375.png`
        ),
      });
    }
  }

  expect(themeColors.get("light")).not.toEqual(themeColors.get("dark"));

  const longTitle = listbox.locator(`[title="${LONG_TITLE}"]`);
  expect(
    await longTitle.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
  ).toBe(true);

  await search.fill("Blocked");
  const blockedCandidate = candidates.find(
    (candidate) => candidate.status === "Blocked"
  )!;
  const blockedReference = formatTaskReference(
    blockedCandidate.referenceNumber
  )!;
  const blockedOption = listbox.getByRole("option", {
    name: `${blockedReference}, ${blockedCandidate.title}, Blocked`,
    exact: true,
  });
  await expect(blockedOption).toBeVisible();
  await search.press("End");
  await expect(blockedOption).toHaveAttribute("data-active", "true");
  await search.press("Enter");
  await expect(
    page.getByRole("button", {
      name: `Remove related task ${blockedCandidate.title}`,
    })
  ).toBeVisible();
});
