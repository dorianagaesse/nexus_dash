import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

async function createEpicArchiveFixture(userId: string) {
  const project = await prisma.project.create({
    data: {
      ownerId: userId,
      name: uniqueProjectName("nd458-epic-archive"),
      description: "Epic archive lifecycle coverage.",
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });
  const suffix = Date.now().toString(36);
  const completedEpicName = `Completed rollout ${suffix}`;
  const activeEpicName = `Active initiative ${suffix}`;

  const completedEpic = await prisma.epic.create({
    data: {
      projectId: project.id,
      name: completedEpicName,
      description: "Deliver the rollout that has already finished.",
    },
    select: { id: true },
  });
  const activeEpic = await prisma.epic.create({
    data: {
      projectId: project.id,
      name: activeEpicName,
      description: "Carry the initiative that is still in flight.",
    },
    select: { id: true },
  });
  const staleCompletion = new Date(Date.now() - 8 * DAY_MS);

  await prisma.task.createMany({
    data: [1, 2].map((index) => ({
      projectId: project.id,
      epicId: completedEpic.id,
      title: `Completed rollout task ${index}`,
      status: "Done",
      completedAt: staleCompletion,
      position: index,
      createdByUserId: userId,
      updatedByUserId: userId,
    })),
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      epicId: activeEpic.id,
      title: "Active initiative task",
      status: "Backlog",
      position: 1,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });

  return {
    projectId: project.id,
    completedEpicId: completedEpic.id,
    completedEpicName,
    activeEpicId: activeEpic.id,
    activeEpicName,
  };
}

test("auto-archives completed epics and supports manual archive and restore", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const fixture = await createEpicArchiveFixture(userId);

  await page.goto(`/projects/${fixture.projectId}#epics`);

  const completedEpic = page.getByRole("article", {
    name: fixture.completedEpicName,
  });
  const activeEpic = page.getByRole("article", {
    name: fixture.activeEpicName,
  });

  // The completed epic passed the grace period, so the dashboard request
  // archives it and it stays hidden until the archived list is revealed.
  await expect(activeEpic).toBeVisible();
  await expect(completedEpic).toHaveCount(0);

  const showArchived = page.getByRole("button", { name: "Show archived (1)" });
  await expect(showArchived).toBeVisible();
  await showArchived.click();

  await expect(completedEpic).toBeVisible();
  await expect(
    completedEpic.getByText("Archived", { exact: true }).first()
  ).toBeVisible();

  await page.getByRole("button", { name: "Hide archived" }).click();
  await expect(completedEpic).toHaveCount(0);

  // Manual archive of the still-active epic hides it from the default list.
  const archiveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/epics/${fixture.activeEpicId}/archive`) &&
      response.ok()
  );
  await page
    .getByRole("button", { name: `Archive epic ${fixture.activeEpicName}` })
    .click();
  await archiveResponse;

  await expect(activeEpic).toHaveCount(0);
  await expect(page.getByText("No active epics.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show archived (2)" })
  ).toBeVisible();

  // Restore brings the epic back to the active list.
  await page.getByRole("button", { name: "Show archived (2)" }).click();
  await expect(activeEpic).toBeVisible();
  await expect(
    activeEpic.getByText("Archived", { exact: true }).first()
  ).toBeVisible();

  const restoreResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().endsWith(`/epics/${fixture.activeEpicId}/archive`) &&
      response.ok()
  );
  await page
    .getByRole("button", { name: `Restore epic ${fixture.activeEpicName}` })
    .click();
  await restoreResponse;

  await expect(activeEpic).toBeVisible();
  await expect(
    activeEpic.getByText("Archived", { exact: true })
  ).toHaveCount(0);

  // Linking a new open task to the archived epic does not unarchive it, and
  // the epic's derived status and progress stay accurate.
  await prisma.task.create({
    data: {
      projectId: fixture.projectId,
      epicId: fixture.completedEpicId,
      title: "Follow-up linked to the archived epic",
      status: "Backlog",
      position: 10,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });

  await page.reload();

  await expect(activeEpic).toBeVisible();
  await expect(completedEpic).toHaveCount(0);

  await page.getByRole("button", { name: "Show archived (1)" }).click();

  await expect(completedEpic).toBeVisible();
  await expect(
    completedEpic.getByText("Archived", { exact: true }).first()
  ).toBeVisible();
  await expect(
    completedEpic.getByRole("progressbar", {
      name: `${fixture.completedEpicName} progress`,
    })
  ).toHaveAttribute("aria-valuetext", "2 of 3 tasks completed");
});
