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

test("defaults steward to creator, supports reassignment, and filters by steward", async ({
  page,
}) => {
  const screenshotDirectory = process.env.TASK_356_SCREENSHOT_DIR?.trim();
  if (screenshotDirectory) {
    await mkdir(path.resolve(screenshotDirectory), { recursive: true });
  }

  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("task-356-steward");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;

  const suffix = Date.now().toString().slice(-8);
  const collaborator = await prisma.user.create({
    data: {
      email: `steward-${suffix}@nexusdash.local`,
      name: "Steward Collaborator",
      username: `steward${suffix}`.slice(0, 20),
      usernameDiscriminator: "0356",
      avatarSeed: "task-356-steward-avatar",
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  await prisma.projectMembership.create({
    data: {
      projectId: projectIdValue,
      userId: collaborator.id,
      role: "editor",
    },
  });

  const createdResponse = await page.request.post(
    `/api/projects/${projectIdValue}/meeting-notes`,
    {
      data: {
        title: "Stewardship kickoff",
        status: "prepared",
        participants: [],
      },
    }
  );
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as {
    note: { id: string; steward: { id: string } | null };
  };
  expect(created.note.steward?.id).toBeTruthy();

  const secondCreatedResponse = await page.request.post(
    `/api/projects/${projectIdValue}/meeting-notes`,
    {
      data: {
        title: "Owner retrospective",
        status: "prepared",
        participants: [],
      },
    }
  );
  expect(secondCreatedResponse.status()).toBe(201);

  const noteId = created.note.id;
  const reassign = await page.request.patch(
    `/api/projects/${projectIdValue}/meeting-notes/${noteId}/steward`,
    {
      data: { steward: { kind: "human", id: collaborator.id } },
    }
  );
  expect(reassign.status()).toBe(200);
  const reassigned = (await reassign.json()) as {
    note: { steward: { id: string } | null };
  };
  expect(reassigned.note.steward?.id).toBe(collaborator.id);

  const cleared = await page.request.patch(
    `/api/projects/${projectIdValue}/meeting-notes/${noteId}/steward`,
    { data: { steward: null } }
  );
  expect(cleared.status()).toBe(200);
  const clearedNote = (await cleared.json()) as {
    note: { steward: null };
  };
  expect(clearedNote.note.steward).toBeNull();

  const invalid = await page.request.patch(
    `/api/projects/${projectIdValue}/meeting-notes/${noteId}/steward`,
    { data: { steward: { kind: "alien", id: "x" } } }
  );
  expect(invalid.status()).toBe(400);

  const filtered = await page.request.get(
    `/api/projects/${projectIdValue}/meeting-notes?steward=unassigned`
  );
  expect(filtered.status()).toBe(200);
  const filteredPayload = (await filtered.json()) as { notes: Array<{ id: string }> };
  expect(filteredPayload.notes.some((note) => note.id === noteId)).toBe(true);

  await page.goto(
    `/projects/${projectIdValue}?meetingNoteSteward=unassigned`
  );
  await expect(page.getByRole("link", { name: "All 2" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Stewarded by me 1" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Unstewarded 1" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toHaveCount(0);

  await page.goto(
    `/projects/${projectIdValue}?meetingNoteQuery=${encodeURIComponent("Stewardship kickoff")}`
  );
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear meeting notes search" }).click();
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toBeVisible();

  const noteCard = page
    .getByRole("button", { name: /Stewardship kickoff/i })
    .first();
  await expect(noteCard).toBeVisible();
  await noteCard.click();
  await expect(
    page.getByRole("button", { name: /Change steward \/ facilitator/i })
  ).toBeVisible();
  if (screenshotDirectory) {
    await page.screenshot({
      path: path.resolve(screenshotDirectory, "meeting-note-steward.png"),
      fullPage: true,
    });
  }
});
