import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("links collaborators, reuses guests, and explicitly adds multi-word names", async ({
  page,
}) => {
  const screenshotDirectory = process.env.TASK_329_SCREENSHOT_DIR?.trim();
  if (screenshotDirectory) {
    await mkdir(path.resolve(screenshotDirectory), { recursive: true });
  }

  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("task-329-participants");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;

  const suffix = Date.now().toString().slice(-8);
  const collaborator = await prisma.user.create({
    data: {
      email: `participant-${suffix}@nexusdash.local`,
      name: "Camille Collaborator",
      username: `camille${suffix}`.slice(0, 20),
      usernameDiscriminator: "0329",
      avatarSeed: "task-329-camille-avatar",
      emailVerified: new Date(),
    },
    select: {
      id: true,
      username: true,
    },
  });
  await prisma.projectMembership.create({
    data: {
      projectId: projectIdValue,
      userId: collaborator.id,
      role: "editor",
    },
  });

  const previousMeetingResponse = await page.request.post(
    `/api/projects/${projectIdValue}/meeting-notes`,
    {
      data: {
        title: "Previous guest history",
        participants: ["Morgan Lee"],
        status: "prepared",
        inputNotes: "",
        outputNotes: "",
        actions: [],
      },
    }
  );
  expect(previousMeetingResponse.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Meeting notes" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare meeting" }).click();
  await page.locator("#meeting-title").fill("Participant identity review");

  const participantInput = page.locator("#meeting-participants");
  await participantInput.fill("cam");
  const collaboratorOption = page.getByRole("option", {
    name: new RegExp(collaborator.username ?? "camille", "i"),
  });
  await expect(collaboratorOption).toContainText("Editor");
  await participantInput.press("Enter");
  await expect(
    page.getByRole("button", {
      name: `Remove ${collaborator.username}`,
    })
  ).toBeVisible();

  await participantInput.pressSequentially("Firstname Name");
  await expect(participantInput).toHaveValue("Firstname Name");
  await expect(
    page.getByRole("button", { name: "Remove Firstname" })
  ).toHaveCount(0);
  await participantInput.press("Tab");
  await expect(
    page.getByRole("button", { name: "Remove Firstname Name" })
  ).toBeVisible();

  await participantInput.fill("Lastname, Firstname");
  await expect(participantInput).toHaveValue("Lastname, Firstname");
  await page
    .getByRole("button", {
      name: "Add Lastname, Firstname as a participant",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Lastname, Firstname" })
  ).toBeVisible();

  await participantInput.fill("Morgan");
  const previousGuestOption = page.getByRole("option", {
    name: /Morgan Lee Previous guest/,
  });
  await expect(previousGuestOption).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => {
      window.localStorage.setItem("nexusdash-theme", nextTheme);
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
    }, theme);
    await page.waitForTimeout(350);

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(previousGuestOption).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);

      if (screenshotDirectory) {
        await page.screenshot({
          path: path.resolve(
            screenshotDirectory,
            `${theme}-${viewport.width}.png`
          ),
        });
      }
    }
  }

  await previousGuestOption.click();
  await expect(
    page.getByRole("button", { name: "Remove Morgan Lee" })
  ).toBeVisible();

  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/meeting-notes$/.test(request.url())
  );
  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/meeting-notes$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Save preparation" }).click();
  const requestPayload = (await (await createRequest).postDataJSON()) as {
    participants: Array<{ userId: string | null; displayName: string }>;
  };
  await createResponse;

  expect(requestPayload.participants).toEqual([
    {
      userId: collaborator.id,
      displayName: collaborator.username,
    },
    {
      userId: null,
      displayName: "Firstname Name",
    },
    {
      userId: null,
      displayName: "Lastname, Firstname",
    },
    {
      userId: null,
      displayName: "Morgan Lee",
    },
  ]);

  const meetingCard = page.getByRole("button", {
    name: /Participant identity review/,
  });
  await expect(meetingCard).toBeVisible();
  await meetingCard.click();
  await expect(page.getByText("Firstname Name", { exact: true })).toBeVisible();
  await expect(page.getByText("Lastname, Firstname", { exact: true })).toBeVisible();
  await expect(page.getByText("Morgan Lee", { exact: true })).toBeVisible();
  // Steward + Created by + Last edited by (same human) plus the linked
  // collaborator avatar; guest names render as text only.
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(4);
});
