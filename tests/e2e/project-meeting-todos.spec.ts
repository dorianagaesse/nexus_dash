import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const screenshotDirectory = process.env.TASK332_SCREENSHOT_DIR?.trim();
const task353ScreenshotDirectory = process.env.TASK353_SCREENSHOT_DIR?.trim();

async function createProjectTodoFixture(userId: string) {
  const ownerProjectName = uniqueProjectName("todo-owner-project");
  const viewerProjectName = uniqueProjectName("todo-viewer-project");
  const ownerMeetingTitle = uniqueProjectName("owner-planning");
  const viewerMeetingTitle = uniqueProjectName("viewer-review");
  const externalOwner = await prisma.user.create({
    data: {
      email: `${uniqueProjectName("todo-owner")}@nexusdash.local`,
      name: "Todo Project Owner",
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  const ownerProject = await prisma.project.create({
    data: {
      ownerId: userId,
      name: ownerProjectName,
      description: "Editable meeting todos.",
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
      meetingNotes: {
        create: {
          title: ownerMeetingTitle,
          scheduledAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
          participants: {
            create: {
              displayName: "Dorian",
              position: 0,
            },
          },
          status: "actions_in_progress",
          inputNotes: "Validate the mobile todo destination.",
          outputNotes: "",
          createdByUserId: userId,
          updatedByUserId: userId,
          actions: {
            create: [
              {
                content: "Complete the mobile navigation audit",
                position: 0,
              },
              {
                content: "Open the source meeting from Todos",
                position: 1,
              },
              {
                content: "Share the completed prototype",
                position: 2,
                completedAt: new Date(Date.now() - 60_000),
              },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      meetingNotes: {
        select: {
          id: true,
          actions: {
            select: { id: true, content: true },
          },
        },
      },
    },
  });
  const viewerProject = await prisma.project.create({
    data: {
      ownerId: externalOwner.id,
      name: viewerProjectName,
      description: "Read-only meeting todos.",
      memberships: {
        create: [
          {
            userId: externalOwner.id,
            role: "owner",
          },
          {
            userId,
            role: "viewer",
          },
        ],
      },
      meetingNotes: {
        create: {
          title: viewerMeetingTitle,
          scheduledAt: new Date(),
          participants: {
            create: {
              displayName: "Camille",
              position: 0,
            },
          },
          status: "actions_in_progress",
          inputNotes: "Viewer coverage.",
          outputNotes: "",
          createdByUserId: externalOwner.id,
          updatedByUserId: externalOwner.id,
          actions: {
            create: {
              content: "Review the shared read-only follow-up",
              position: 0,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return {
    ownerProjectId: ownerProject.id,
    viewerProjectId: viewerProject.id,
    ownerProjectName,
    ownerMeetingTitle,
    ownerMeetingId: ownerProject.meetingNotes[0]!.id,
    sourceTodoId: ownerProject.meetingNotes[0]!.actions.find(
      (action) => action.content === "Open the source meeting from Todos"
    )!.id,
  };
}

test.describe("project meeting todos", () => {
  test("uses a project-scoped route and grouped mobile navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const userId = await signInAsVerifiedUser(page);
    const fixture = await createProjectTodoFixture(userId);

    await page.goto(`/projects/${fixture.ownerProjectId}/todos`);

    const mobileNavigation = page.locator(
      "nav[aria-label='Primary navigation']:visible"
    );
    await expect(
      mobileNavigation.getByRole("group", { name: "Workspace navigation" })
    ).toBeVisible();
    await expect(
      mobileNavigation.getByRole("group", { name: "Project navigation" })
    ).toBeVisible();
    await expect(mobileNavigation.getByRole("link")).toHaveCount(4);
    await expect(
      mobileNavigation.getByRole("link", { name: "Todos", exact: true })
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "Todos", exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Complete the mobile navigation audit")
    ).toBeVisible();
    await expect(
      page.getByText("Review the shared read-only follow-up")
    ).toHaveCount(0);
    if (screenshotDirectory) {
      await mkdir(path.resolve(screenshotDirectory), { recursive: true });
      await page.screenshot({
        path: path.resolve(screenshotDirectory, "iphone-14-pro-light.png"),
        fullPage: true,
      });
    }

    const targetSizes = await mobileNavigation
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => {
          const rect = link.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      );
    expect(
      targetSizes.every((target) => target.width >= 44 && target.height >= 44)
    ).toBe(true);
    const completionBox = await page
      .getByRole("button", {
        name: "Complete todo: Complete the mobile navigation audit",
      })
      .boundingBox();
    expect(completionBox?.width).toBeGreaterThanOrEqual(44);
    expect(completionBox?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    if (screenshotDirectory) {
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.resolve(screenshotDirectory, "iphone-14-pro-dark.png"),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await page.setViewportSize({ width: 393, height: 852 });

    await page.getByRole("link", { name: /^completed/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${fixture.ownerProjectId}/todos\\?view=completed$`)
    );
    await expect(page.getByText("Share the completed prototype")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${fixture.ownerProjectId}/todos$`)
    );

    const completionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/meeting-notes\/[^/]+\/actions\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page
      .getByRole("button", {
        name: "Complete todo: Complete the mobile navigation audit",
      })
      .click();
    await completionResponse;
    await expect(page.getByText("Todo completed.")).toBeVisible();
    await expect(
      page.getByText("Complete the mobile navigation audit")
    ).toBeHidden();

    await page
      .locator("li", { hasText: "Open the source meeting from Todos" })
      .getByRole("link", { name: new RegExp(fixture.ownerMeetingTitle) })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/projects/${fixture.ownerProjectId}\\?meetingNoteId=${fixture.ownerMeetingId}&meetingTodoId=${fixture.sourceTodoId}`
      )
    );
    const meetingDialog = page.getByRole("dialog");
    await expect(
      meetingDialog.getByRole("heading", {
        name: fixture.ownerMeetingTitle,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Todos, \d+ open/ })
    ).toBeHidden();
    await meetingDialog
      .getByRole("button", { name: `Close ${fixture.ownerMeetingTitle}` })
      .click();

    await page.goto(`/projects/${fixture.viewerProjectId}/todos`);
    await expect(
      page.getByText("Review the shared read-only follow-up")
    ).toBeVisible();
    await expect(page.getByText("View only", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Complete todo: Review the shared read-only follow-up",
      })
    ).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects/${fixture.ownerProjectId}`);
    const todosTrigger = page.getByRole("button", { name: /^Todos, \d+ open/ });
    await expect(todosTrigger).toBeVisible();
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await todosTrigger.click();
    const todosDialog = page.getByRole("dialog", { name: "Meeting todos" });
    await expect(todosDialog).toBeVisible();
    await expect(
      todosDialog.getByText("Open the source meeting from Todos")
    ).toBeVisible();
    if (task353ScreenshotDirectory) {
      await mkdir(path.resolve(task353ScreenshotDirectory), { recursive: true });
      await page.screenshot({
        path: path.resolve(task353ScreenshotDirectory, "desktop-modal-dark.png"),
        fullPage: false,
      });
    }
    await todosDialog
      .getByRole("button", { name: "Close meeting todos" })
      .click();
    await expect(todosTrigger).toBeFocused();
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await todosTrigger.click();
    await expect(todosDialog).toBeVisible();
    if (task353ScreenshotDirectory) {
      await page.screenshot({
        path: path.resolve(task353ScreenshotDirectory, "desktop-modal-light.png"),
        fullPage: false,
      });
    }

    const projectBounds = await page.locator("[data-project-page]").boundingBox();
    const moveHandle = todosDialog.getByRole("button", {
      name: "Move meeting todos dialog",
    });
    await moveHandle.focus();
    await expect(moveHandle).toBeFocused();
    await page.waitForTimeout(250);
    const initialDialogBounds = await todosDialog.boundingBox();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.waitForTimeout(50);
    const keyboardMovedBounds = await todosDialog.boundingBox();
    expect(keyboardMovedBounds?.x).toBeLessThan(initialDialogBounds?.x ?? 0);

    const handleBounds = await moveHandle.boundingBox();
    expect(handleBounds).not.toBeNull();
    if (handleBounds) {
      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2,
        handleBounds.y + handleBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2 + 120,
        handleBounds.y + handleBounds.height / 2 + 80,
        { steps: 8 }
      );
      await page.mouse.up();
    }

    const pointerMovedBounds = await todosDialog.boundingBox();
    expect(pointerMovedBounds?.x).toBeGreaterThan(keyboardMovedBounds?.x ?? 0);
    expect(pointerMovedBounds).not.toBeNull();
    expect(projectBounds).not.toBeNull();
    if (pointerMovedBounds && projectBounds) {
      expect(pointerMovedBounds.x).toBeGreaterThanOrEqual(projectBounds.x + 15);
      expect(pointerMovedBounds.x + pointerMovedBounds.width).toBeLessThanOrEqual(
        projectBounds.x + projectBounds.width - 15
      );
      expect(pointerMovedBounds.y).toBeGreaterThanOrEqual(15);
      expect(pointerMovedBounds.y + pointerMovedBounds.height).toBeLessThanOrEqual(885);
    }

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(todosDialog).toBeVisible();
    await page.waitForTimeout(100);
    const resizedProjectBounds = await page
      .locator("[data-project-page]")
      .boundingBox();
    const resizedDialogBounds = await todosDialog.boundingBox();
    expect(resizedProjectBounds).not.toBeNull();
    expect(resizedDialogBounds).not.toBeNull();
    if (resizedDialogBounds && resizedProjectBounds) {
      expect(resizedDialogBounds.x).toBeGreaterThanOrEqual(
        resizedProjectBounds.x + 15
      );
      expect(resizedDialogBounds.x + resizedDialogBounds.width).toBeLessThanOrEqual(
        resizedProjectBounds.x + resizedProjectBounds.width - 15
      );
      expect(resizedDialogBounds.y).toBeGreaterThanOrEqual(15);
      expect(resizedDialogBounds.y + resizedDialogBounds.height).toBeLessThanOrEqual(
        705
      );
    }

    await todosDialog
      .getByRole("button", { name: "Close meeting todos" })
      .click();
    await expect(todosDialog).toBeHidden();
    await expect(todosTrigger).toBeFocused();
  });
});
