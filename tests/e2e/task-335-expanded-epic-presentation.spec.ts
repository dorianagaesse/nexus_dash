import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const screenshotDirectory = process.env.TASK335_SCREENSHOT_DIR?.trim();

async function createDenseEpicFixture(userId: string) {
  const project = await prisma.project.create({
    data: {
      ownerId: userId,
      name: uniqueProjectName("expanded-epics"),
      description: "Responsive epic presentation coverage.",
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });
  const primaryEpicName = "Workspace sharing";
  const primaryEpic = await prisma.epic.create({
    data: {
      projectId: project.id,
      name: primaryEpicName,
      description:
        "Give collaborators the complete rollout narrative, expected outcome, and enough implementation context to make the initiative understandable at a glance.",
    },
    select: { id: true },
  });
  const secondaryEpicName = "Launch readiness";

  await prisma.epic.create({
    data: {
      projectId: project.id,
      name: secondaryEpicName,
      description: "Confirm the product is ready for the first invited teams.",
    },
  });
  await prisma.task.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      projectId: project.id,
      epicId: primaryEpic.id,
      title:
        index === 7
          ? "Validate a deliberately long linked task title without truncating meaningful project context"
          : `Workspace sharing task ${index + 1}`,
      status: index < 2 ? "Done" : "Backlog",
      completedAt: index < 2 ? new Date() : null,
      position: index,
      createdByUserId: userId,
      updatedByUserId: userId,
    })),
  });

  return {
    projectId: project.id,
    primaryEpicName,
    secondaryEpicName,
  };
}

test.describe("TASK-335 epic detail disclosure", () => {
  test("keeps cards compact until their details are requested", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const userId = await signInAsVerifiedUser(page);
    const fixture = await createDenseEpicFixture(userId);
    await page.addInitScript(() => {
      window.localStorage.setItem("nexusdash-theme", "light");
    });

    await page.goto(`/projects/${fixture.projectId}#epics`);

    const primaryEpic = page.getByRole("article", {
      name: fixture.primaryEpicName,
    });
    const secondaryEpic = page.getByRole("article", {
      name: fixture.secondaryEpicName,
    });
    const description = primaryEpic.getByText("complete rollout narrative");
    const linkedTasks = primaryEpic.getByRole("listitem");
    const showDetails = primaryEpic.getByRole("button", {
      name: `Show details for ${fixture.primaryEpicName}`,
    });

    await expect(primaryEpic).toBeVisible();
    await expect(secondaryEpic).toBeVisible();
    await expect(description).toBeHidden();
    await expect(linkedTasks.first()).toBeHidden();
    await expect(showDetails).toBeVisible();
    await expect(showDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      primaryEpic.getByText("Show details", { exact: true })
    ).toHaveCount(0);
    await expect(
      primaryEpic.getByRole("progressbar", {
        name: `${fixture.primaryEpicName} progress`,
      })
    ).toHaveAttribute("aria-valuenow", "25");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);

    const mobileEpicBounds = await primaryEpic.boundingBox();
    const mobileDisclosureBounds = await showDetails.boundingBox();
    const mobileEditBounds = await primaryEpic
      .getByRole("button", {
        name: `Edit epic ${fixture.primaryEpicName}`,
      })
      .boundingBox();
    expect(mobileEpicBounds).not.toBeNull();
    expect(mobileDisclosureBounds).not.toBeNull();
    expect(mobileEditBounds).not.toBeNull();
    expect(mobileEpicBounds!.x).toBeGreaterThanOrEqual(0);
    expect(mobileEpicBounds!.x + mobileEpicBounds!.width).toBeLessThanOrEqual(
      375
    );
    expect(mobileEpicBounds!.height).toBeLessThan(360);
    expect(mobileDisclosureBounds!.width).toBeGreaterThanOrEqual(44);
    expect(mobileDisclosureBounds!.height).toBeGreaterThanOrEqual(44);
    expect(mobileEditBounds!.x).toBeGreaterThan(mobileDisclosureBounds!.x);
    expect(
      mobileEditBounds!.x -
        (mobileDisclosureBounds!.x + mobileDisclosureBounds!.width)
    ).toBeLessThanOrEqual(9);

    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await primaryEpic.screenshot({
        path: path.resolve(screenshotDirectory, "mobile-collapsed-epic.png"),
      });
    }

    await showDetails.focus();
    await showDetails.press("Enter");

    const hideDetails = primaryEpic.getByRole("button", {
      name: `Hide details for ${fixture.primaryEpicName}`,
    });
    await expect(hideDetails).toHaveAttribute("aria-expanded", "true");
    await expect(description).toBeVisible();
    await expect(linkedTasks).toHaveCount(7);
    for (let taskIndex = 0; taskIndex < 6; taskIndex += 1) {
      await expect(linkedTasks.nth(taskIndex)).toBeVisible();
    }
    await expect(primaryEpic.getByText("+2 more linked tasks")).toBeVisible();
    await expect(
      secondaryEpic.getByText("ready for the first invited teams")
    ).toBeHidden();

    await hideDetails.click();
    await expect(description).toBeHidden();
    await expect(showDetails).toHaveAttribute("aria-expanded", "false");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(primaryEpic).toBeVisible();
    await expect(description).toBeHidden();
    await expect(showDetails).toBeVisible();

    const firstEpicBounds = await primaryEpic.boundingBox();
    const secondEpicBounds = await secondaryEpic.boundingBox();
    expect(firstEpicBounds).not.toBeNull();
    expect(secondEpicBounds).not.toBeNull();
    expect(
      Math.abs(firstEpicBounds!.width - secondEpicBounds!.width)
    ).toBeLessThan(2);
    expect(Math.abs(firstEpicBounds!.y - secondEpicBounds!.y)).toBeLessThan(2);
    expect(Math.abs(firstEpicBounds!.x - secondEpicBounds!.x)).toBeGreaterThan(
      firstEpicBounds!.width
    );

    const editButton = primaryEpic.getByRole("button", {
      name: `Edit epic ${fixture.primaryEpicName}`,
    });
    const editButtonBounds = await editButton.boundingBox();
    expect(editButtonBounds).not.toBeNull();
    expect(editButtonBounds!.width).toBeGreaterThanOrEqual(44);
    expect(editButtonBounds!.height).toBeGreaterThanOrEqual(44);

    const showDetailsBounds = await showDetails.boundingBox();
    expect(showDetailsBounds).not.toBeNull();
    expect(showDetailsBounds!.width).toBeGreaterThanOrEqual(44);
    expect(showDetailsBounds!.height).toBeGreaterThanOrEqual(44);

    await showDetails.click();
    await expect(description).toBeVisible();

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(primaryEpic).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);

    if (screenshotDirectory) {
      await primaryEpic.screenshot({
        path: path.resolve(
          screenshotDirectory,
          "desktop-disclosed-epic-dark.png"
        ),
      });
    }
  });
});
