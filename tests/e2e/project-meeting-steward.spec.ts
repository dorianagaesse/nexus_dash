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
    select: { id: true, username: true },
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
        participants: [
          {
            userId: collaborator.id,
            displayName: collaborator.username,
          },
        ],
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
  const filteredPayload = (await filtered.json()) as {
    notes: Array<{ id: string }>;
  };
  expect(filteredPayload.notes.some((note) => note.id === noteId)).toBe(true);

  await page.goto(`/projects/${projectIdValue}?meetingNoteSteward=unassigned`);
  await expect(page.getByRole("link", { name: "All 2" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Stewarded by me 1" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Unstewarded 1" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toHaveCount(0);

  await page.goto(
    `/projects/${projectIdValue}?meetingNoteQuery=${encodeURIComponent("Stewardship kickoff")}`
  );
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear meeting notes search" })
    .click();
  await expect(
    page.getByRole("button", { name: /Owner retrospective/i })
  ).toBeVisible();

  const noteCard = page
    .getByRole("button", { name: /Stewardship kickoff/i })
    .first();
  await expect(noteCard).toBeVisible();
  await noteCard.click();
  const facilitatorToggle = page.getByRole("button", {
    name: `Make ${collaborator.username} steward / facilitator`,
  });
  await expect(facilitatorToggle).toBeVisible();
  await facilitatorToggle.hover();
  await expect(
    page.getByRole("tooltip", { name: "Make steward" })
  ).toBeVisible();
  await facilitatorToggle.click();
  const clearFacilitator = page.getByRole("button", {
    name: `Remove ${collaborator.username} as steward / facilitator`,
  });
  await expect(clearFacilitator).toBeVisible();
  await expect(clearFacilitator).toHaveAttribute("aria-pressed", "true");
  await clearFacilitator.hover();
  await expect(page.getByRole("tooltip", { name: "Steward" })).toBeVisible();
  await clearFacilitator.click();
  await expect(facilitatorToggle).toBeVisible();
  if (screenshotDirectory) {
    await page.screenshot({
      path: path.resolve(screenshotDirectory, "meeting-note-steward.png"),
      fullPage: true,
    });
  }
});

test("supports external participant stewards through rename and removal", async ({
  page,
}) => {
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd-396-guest-steward");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;

  const createdResponse = await page.request.post(
    `/api/projects/${projectIdValue}/meeting-notes`,
    {
      data: {
        title: "Guest stewardship review",
        status: "prepared",
        participants: [{ userId: null, displayName: "Camille Guest" }],
      },
    }
  );
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as { note: { id: string } };
  const noteUrl = `/api/projects/${projectIdValue}/meeting-notes/${created.note.id}`;

  // Case- and whitespace-insensitive references snapshot the canonical name.
  const assigned = await page.request.patch(`${noteUrl}/steward`, {
    data: { steward: { kind: "participant", id: "  camille   guest " } },
  });
  expect(assigned.status()).toBe(200);
  const assignedNote = (await assigned.json()) as {
    note: {
      steward: {
        kind: string;
        displayName: string;
        status: string;
        isAssignable: boolean;
      } | null;
    };
  };
  expect(assignedNote.note.steward).toMatchObject({
    kind: "participant",
    displayName: "Camille Guest",
    status: "active",
    isAssignable: true,
  });

  await page.goto(`/projects/${projectIdValue}`);
  await expect(page.getByRole("link", { name: "All 1" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Stewarded by me 0" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Unstewarded 0" })).toBeVisible();

  await page
    .getByRole("button", { name: /Guest stewardship review/i })
    .first()
    .click();
  const clearFacilitator = page.getByRole("button", {
    name: "Remove Camille Guest as steward / facilitator",
  });
  await expect(clearFacilitator).toBeVisible();
  await expect(clearFacilitator).toHaveAttribute("aria-pressed", "true");
  await clearFacilitator.hover();
  await expect(page.getByRole("tooltip", { name: "Steward" })).toBeVisible();
  await clearFacilitator.click();

  const assignFacilitator = page.getByRole("button", {
    name: "Make Camille Guest steward / facilitator",
  });
  await expect(assignFacilitator).toBeVisible();
  await assignFacilitator.click();
  await expect(
    page.getByRole("button", {
      name: "Remove Camille Guest as steward / facilitator",
    })
  ).toHaveAttribute("aria-pressed", "true");

  // Renaming the guest keeps the snapshot and flags the steward for reassignment.
  const renamed = await page.request.patch(noteUrl, {
    data: {
      title: "Guest stewardship review",
      participants: [{ userId: null, displayName: "Camilla Guest" }],
    },
  });
  expect(renamed.status()).toBe(200);
  const renamedNote = (await renamed.json()) as {
    note: {
      steward: {
        displayName: string;
        status: string;
        isAssignable: boolean;
      } | null;
    };
  };
  expect(renamedNote.note.steward).toMatchObject({
    displayName: "Camille Guest",
    status: "inactive",
    isAssignable: false,
  });

  await page.reload();
  await page
    .getByRole("button", { name: /Guest stewardship review/i })
    .first()
    .click();
  const staleFacilitator = page.getByRole("button", {
    name: "Remove Camille Guest as steward / facilitator",
  });
  await expect(staleFacilitator).toBeVisible();
  await expect(staleFacilitator.getByLabel("Needs reassignment")).toBeVisible();
  await page
    .getByRole("button", { name: "Make Camilla Guest steward / facilitator" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Camilla Guest as steward / facilitator",
    })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(staleFacilitator).toHaveCount(0);

  // Removing the guest entirely also leaves the snapshot for reassignment.
  const removed = await page.request.patch(noteUrl, {
    data: { title: "Guest stewardship review", participants: [] },
  });
  expect(removed.status()).toBe(200);
  const removedNote = (await removed.json()) as {
    note: {
      steward: {
        displayName: string;
        status: string;
        isAssignable: boolean;
      } | null;
    };
  };
  expect(removedNote.note.steward).toMatchObject({
    displayName: "Camilla Guest",
    status: "inactive",
    isAssignable: false,
  });

  await page.reload();
  await page
    .getByRole("button", { name: /Guest stewardship review/i })
    .first()
    .click();
  const orphanedFacilitator = page.getByRole("button", {
    name: "Remove Camilla Guest as steward / facilitator",
  });
  await expect(orphanedFacilitator).toBeVisible();
  await expect(orphanedFacilitator.getByLabel("Needs reassignment")).toBeVisible();
  await orphanedFacilitator.click();
  await expect(orphanedFacilitator).toHaveCount(0);
});
