import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { formatTaskReference } from "../../lib/task-reference";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const screenshotDirectory = process.env.TASK351_SCREENSHOT_DIR?.trim();

test("task references stay stable and identify related-task candidates", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("task-reference"),
      description: "Stable task reference coverage",
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
      title: "Reference stability task",
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: {
      id: true,
      referenceNumber: true,
    },
  });
  const candidateTask = await prisma.task.create({
    data: {
      title: "Reference search candidate",
      status: "Blocked",
      projectId: project.id,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: {
      id: true,
      referenceNumber: true,
    },
  });
  const currentReference = formatTaskReference(currentTask.referenceNumber)!;
  const candidateReference = formatTaskReference(candidateTask.referenceNumber)!;
  expect(currentReference).toBe("ND-1");
  expect(candidateReference).toBe("ND-2");

  const otherProject = await prisma.project.create({
    data: { name: uniqueProjectName("other-reference"), ownerId: userId },
  });
  const otherResponse = await page.request.post(`/api/projects/${otherProject.id}/tasks`, {
    data: { title: "Other project's first task" },
  });
  expect(otherResponse.ok()).toBe(true);
  const otherTask = (await otherResponse.json()).task;
  expect(otherTask.reference).toBe("ND-1");
  const foreignCandidate = await page.request.post(`/api/projects/${otherProject.id}/tasks`, {
    data: { title: "Foreign reference candidate" },
  });
  expect(foreignCandidate.ok()).toBe(true);
  expect((await foreignCandidate.json()).task.reference).toBe("ND-2");
  for (const [projectId, expectedId] of [[project.id, currentTask.id], [otherProject.id, otherTask.id]]) {
    const response = await page.request.get(`/api/projects/${projectId}/tasks/reference?reference=ND-1`);
    expect(response.ok()).toBe(true);
    expect((await response.json()).id).toBe(expectedId);
    const search = await page.request.get(`/api/projects/${projectId}/tasks/search?q=ND-1`);
    expect((await search.json()).taskIds).toEqual([expectedId]);
  }
  const missingLegacy = await page.request.get(`/api/projects/${project.id}/tasks/reference?reference=ND-1&namespace=legacy`);
  expect(missingLegacy.status()).toBe(404);

  await page.goto(`/projects/${project.id}?taskId=${currentTask.id}`);
  await expect(
    page.getByRole("dialog").getByLabel(`Task reference ${currentReference}`)
  ).toBeVisible();

  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: /^Edit$/ }).click();

  const titleInput = page.getByRole("textbox", { name: "Task title" });
  await titleInput.fill("Reference stability task updated");
  const detailSearch = page.getByRole("combobox", {
    name: "Search related tasks",
  });
  await detailSearch.fill(candidateReference);
  const detailCandidate = page.getByRole("option", {
    name: "Reference search candidate",
  });
  await expect(detailCandidate).toBeVisible();
  await expect(detailCandidate).toContainText(candidateReference);
  await expect(page.getByRole("option", { name: "Foreign reference candidate" })).toHaveCount(0);

  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDirectory, "task-reference-detail-search.png"),
      fullPage: true,
    });
  }

  await detailCandidate.click();
  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/tasks/${currentTask.id}`) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  const updateResponse = await updateResponsePromise;
  const updatePayload = (await updateResponse.json()) as {
    task: { reference: string };
  };
  expect(updatePayload.task.reference).toBe(currentReference);
  await expect(
    page.getByRole("dialog").getByLabel(`Task reference ${currentReference}`)
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("dialog").getByLabel(`Task reference ${currentReference}`)
  ).toBeVisible();

  await page.getByRole("button", { name: "Close task" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "New task" }).click();
  const createSearch = page.getByRole("combobox", {
    name: "Search related tasks",
  });
  await createSearch.scrollIntoViewIfNeeded();
  await createSearch.fill(candidateReference);
  const createCandidate = page.getByRole("option", {
    name: "Reference search candidate",
  });
  await expect(createCandidate).toBeVisible();
  await expect(createCandidate).toContainText(candidateReference);

  const candidateBounds = await createCandidate.boundingBox();
  expect(candidateBounds).not.toBeNull();
  expect(candidateBounds!.x).toBeGreaterThanOrEqual(0);
  expect(candidateBounds!.x + candidateBounds!.width).toBeLessThanOrEqual(375);

  await createCandidate.click();
  await page.locator("#task-title").fill("Created with stable reference");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/projects/${project.id}/tasks`) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create task" }).click();
  const createResponse = await createResponsePromise;
  const createPayload = (await createResponse.json()) as {
    task: { id: string; reference: string };
  };
  expect(createPayload.task.reference).toBe("ND-3");
  expect(createPayload.task.reference).not.toBe(currentReference);
  expect(createPayload.task.reference).not.toBe(candidateReference);

  await page.getByRole("button", { name: /Created with stable reference/ }).click();
  await expect(
    page.getByRole("dialog").getByLabel(`Task reference ${createPayload.task.reference}`)
  ).toBeVisible();
});
