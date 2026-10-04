import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { clickUntilVisible } from "./helpers/interaction-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function createLeadershipProject(ownerUserId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd-185-epic-leadership"),
      description: "Epic leadership accountability coverage.",
      ownerId: ownerUserId,
      memberships: {
        create: {
          userId: ownerUserId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const secondMember = await prisma.user.create({
    data: {
      email: `e2e-nd185-${suffix}@nexusdash.local`,
      name: "Second Project Member",
      username: suffix.replace(/[^a-z0-9]/g, "").slice(0, 12),
      usernameDiscriminator: "0001",
      emailVerified: new Date(),
    },
    select: { id: true, username: true },
  });
  await prisma.projectMembership.create({
    data: {
      projectId: project.id,
      userId: secondMember.id,
      role: "editor",
    },
  });
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: ownerUserId },
    select: { username: true },
  });

  return {
    projectId: project.id,
    ownerUsername: owner.username ?? "Account",
    secondMember: {
      id: secondMember.id,
      username: secondMember.username ?? "Account",
    },
  };
}

async function createLeadershipEpic(input: {
  projectId: string;
  ownerUserId: string;
  name: string;
  lead?: { id: string; displayName: string };
}) {
  return prisma.epic.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      description: "Carry the initiative with an explicit accountable lead.",
      createdByUserId: input.ownerUserId,
      updatedByUserId: input.ownerUserId,
      ...(input.lead
        ? {
            leadKind: "human",
            leadUserId: input.lead.id,
            leadDisplayNameSnapshot: input.lead.displayName,
            leadAssignedByKind: "human",
            leadAssignedByUserId: input.ownerUserId,
            leadAssignedByDisplayNameSnapshot: input.lead.displayName,
            leadAssignedAt: new Date(),
          }
        : {}),
    },
    select: { id: true },
  });
}

test("defaults the lead to the creating member and surfaces provenance", async ({
  page,
}) => {
  const ownerUserId = await signInAsVerifiedUser(page);
  const fixture = await createLeadershipProject(ownerUserId);
  const epicName = `Lead defaults ${Date.now().toString(36)}`;

  await page.goto(`/projects/${fixture.projectId}#epics`);

  await page.getByRole("button", { name: "New epic" }).click();
  await page.locator("#create-epic-name").fill(epicName);
  await page
    .locator("#create-epic-description")
    .fill("Ensure every initiative names an accountable lead.");
  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/epics") &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create epic" }).click();
  await createResponse;

  const epicArticle = page.getByRole("article", { name: epicName });
  await expect(epicArticle).toBeVisible();

  // The lead chip defaults to the member who created the epic.
  await expect(
    epicArticle.getByRole("button", {
      name: `Change initiative lead, currently ${fixture.ownerUsername}`,
    })
  ).toBeVisible();

  // Provenance names the creator and last editor explicitly.
  const createdBy = epicArticle.locator('[title^="Created by:"]');
  await expect(createdBy).toContainText(fixture.ownerUsername);
  const lastEditedBy = epicArticle.locator('[title^="Last edited by:"]');
  await expect(lastEditedBy).toContainText(fixture.ownerUsername);

  // The epic-scoped history lists the creation event.
  await clickUntilVisible(
    epicArticle.getByRole("button", { name: `Show details for ${epicName}` }),
    epicArticle.getByRole("button", { name: `Hide details for ${epicName}` })
  );
  await expect(epicArticle.getByText("created the epic")).toBeVisible();
});

test("reassigns the lead through the chip and records the change in history", async ({
  page,
}) => {
  const ownerUserId = await signInAsVerifiedUser(page);
  const fixture = await createLeadershipProject(ownerUserId);
  const epicName = `Lead reassignment ${Date.now().toString(36)}`;
  const epic = await createLeadershipEpic({
    projectId: fixture.projectId,
    ownerUserId,
    name: epicName,
    lead: { id: ownerUserId, displayName: fixture.ownerUsername },
  });

  await page.goto(`/projects/${fixture.projectId}#epics`);

  const epicArticle = page.getByRole("article", { name: epicName });
  await expect(epicArticle).toBeVisible();

  const leadTrigger = epicArticle.locator(
    '[data-meeting-todo-assignee-chip="true"]'
  );
  await expect(leadTrigger).toBeVisible();
  await leadTrigger.click();

  const listbox = page.getByRole("listbox", { name: "Assign initiative lead" });
  await expect(listbox).toBeVisible();
  const assignResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/epics/${epic.id}/lead`) &&
      response.ok()
  );
  await listbox
    .getByRole("option", { name: new RegExp(fixture.secondMember.username) })
    .click();
  await assignResponse;

  await expect(
    epicArticle.getByRole("button", {
      name: `Change initiative lead, currently ${fixture.secondMember.username}`,
    })
  ).toBeVisible();
  await expect(page.getByText("Lead updated.")).toBeVisible();

  const storedEpic = await prisma.epic.findUniqueOrThrow({
    where: { id: epic.id },
    select: {
      leadKind: true,
      leadUserId: true,
      leadDisplayNameSnapshot: true,
      leadAssignedByUserId: true,
    },
  });
  expect(storedEpic.leadKind).toBe("human");
  expect(storedEpic.leadUserId).toBe(fixture.secondMember.id);
  expect(storedEpic.leadDisplayNameSnapshot).toBe(
    fixture.secondMember.username
  );
  expect(storedEpic.leadAssignedByUserId).toBe(ownerUserId);

  // The reassignment is preserved across reloads and recorded in history.
  await page.reload();
  const reloadedArticle = page.getByRole("article", { name: epicName });
  await expect(
    reloadedArticle.getByRole("button", {
      name: `Change initiative lead, currently ${fixture.secondMember.username}`,
    })
  ).toBeVisible();
  await clickUntilVisible(
    reloadedArticle.getByRole("button", {
      name: `Show details for ${epicName}`,
    }),
    reloadedArticle.getByRole("button", {
      name: `Hide details for ${epicName}`,
    })
  );
  await expect(
    reloadedArticle.getByText(
      `set the lead to ${fixture.secondMember.username}`
    )
  ).toBeVisible();
});

test("keeps an inactive former lead attached with a needs-reassignment state", async ({
  page,
}) => {
  const ownerUserId = await signInAsVerifiedUser(page);
  const fixture = await createLeadershipProject(ownerUserId);
  const epicName = `Departed lead ${Date.now().toString(36)}`;
  await createLeadershipEpic({
    projectId: fixture.projectId,
    ownerUserId,
    name: epicName,
    lead: {
      id: fixture.secondMember.id,
      displayName: fixture.secondMember.username,
    },
  });

  // The second member leaves the project; the epic still names them as lead.
  await prisma.projectMembership.deleteMany({
    where: {
      projectId: fixture.projectId,
      userId: fixture.secondMember.id,
    },
  });

  await page.goto(`/projects/${fixture.projectId}#epics`);

  const epicArticle = page.getByRole("article", { name: epicName });
  await expect(epicArticle).toBeVisible();

  const leadTrigger = epicArticle.locator(
    '[data-meeting-todo-assignee-chip="true"][data-needs-reassignment="true"]'
  );
  await expect(leadTrigger).toBeVisible();
  await expect(leadTrigger).toContainText(fixture.secondMember.username);
  await expect(epicArticle.getByLabel("Needs reassignment")).toBeVisible();
});
