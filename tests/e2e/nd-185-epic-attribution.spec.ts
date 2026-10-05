import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { clickUntilVisible } from "./helpers/interaction-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function createAttributionProject(ownerUserId: string) {
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd-185-epic-attribution"),
      description: "Epic attribution coverage.",
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
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: ownerUserId },
    select: { username: true },
  });

  return {
    projectId: project.id,
    ownerUsername: owner.username ?? "Account",
  };
}

test("shows created and last-edited attribution inside the epic details disclosure", async ({
  page,
}) => {
  const ownerUserId = await signInAsVerifiedUser(page);
  const fixture = await createAttributionProject(ownerUserId);
  const epicName = `Attributed epic ${Date.now().toString(36)}`;

  await page.goto(`/projects/${fixture.projectId}#epics`);

  await page.getByRole("button", { name: "New epic" }).click();
  await page.locator("#create-epic-name").fill(epicName);
  await page
    .locator("#create-epic-description")
    .fill("Confirm who created and last edited the epic.");
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

  // Attribution lives behind the disclosure, not on the compact face.
  const createdBy = epicArticle.locator('[title^="Created by:"]');
  const lastEditedBy = epicArticle.locator('[title^="Last edited by:"]');
  await expect(createdBy).toBeHidden();
  await expect(lastEditedBy).toBeHidden();

  await clickUntilVisible(
    epicArticle.getByRole("button", { name: `Show details for ${epicName}` }),
    epicArticle.getByRole("button", { name: `Hide details for ${epicName}` })
  );

  await expect(createdBy).toBeVisible();
  await expect(createdBy).toContainText(fixture.ownerUsername);
  await expect(createdBy).toHaveAttribute(
    "title",
    new RegExp(`^Created by: ${fixture.ownerUsername}`)
  );
  await expect(lastEditedBy).toBeVisible();
  await expect(lastEditedBy).toContainText(fixture.ownerUsername);

  const storedEpic = await prisma.epic.findFirstOrThrow({
    where: { projectId: fixture.projectId, name: epicName },
    select: { id: true },
  });

  // Editing the epic records the acting user as the last editor; the creator
  // attribution and the credential columns stay untouched.
  await epicArticle
    .getByRole("button", { name: `Edit epic ${epicName}` })
    .click();
  const editingArticle = page.getByRole("article", {
    name: `Edit epic ${epicName}`,
  });
  await editingArticle
    .locator("textarea")
    .fill("Confirm the attribution survives an edit.");
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/epics/${storedEpic.id}`) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Save epic" }).click();
  await updateResponse;

  await page.reload();

  const reloadedArticle = page.getByRole("article", { name: epicName });
  await expect(reloadedArticle).toBeVisible();
  await clickUntilVisible(
    reloadedArticle.getByRole("button", {
      name: `Show details for ${epicName}`,
    }),
    reloadedArticle.getByRole("button", {
      name: `Hide details for ${epicName}`,
    })
  );
  await expect(
    reloadedArticle.locator('[title^="Created by:"]')
  ).toContainText(fixture.ownerUsername);
  await expect(
    reloadedArticle.locator('[title^="Last edited by:"]')
  ).toContainText(fixture.ownerUsername);

  const storedAttribution = await prisma.epic.findUniqueOrThrow({
    where: { id: storedEpic.id },
    select: {
      createdByUserId: true,
      updatedByUserId: true,
      createdByCredentialId: true,
      updatedByCredentialId: true,
    },
  });
  expect(storedAttribution.createdByUserId).toBe(ownerUserId);
  expect(storedAttribution.updatedByUserId).toBe(ownerUserId);
  expect(storedAttribution.createdByCredentialId).toBeNull();
  expect(storedAttribution.updatedByCredentialId).toBeNull();
});

test("renders agent credential attribution with the durable label snapshot", async ({
  page,
}) => {
  const ownerUserId = await signInAsVerifiedUser(page);
  const fixture = await createAttributionProject(ownerUserId);
  const suffix = Date.now().toString(36);
  const epicName = `Agent-authored epic ${suffix}`;

  const credential = await prisma.apiCredential.create({
    data: {
      projectId: fixture.projectId,
      createdByUserId: ownerUserId,
      label: "Release Agent",
      publicId: `nd185-agent-${suffix}`,
      secretHash: "not-a-real-secret-hash",
    },
    select: { id: true },
  });
  await prisma.epic.create({
    data: {
      projectId: fixture.projectId,
      name: epicName,
      description: "Carry provenance written by an agent credential.",
      createdByUserId: ownerUserId,
      updatedByUserId: ownerUserId,
      createdByCredentialId: credential.id,
      createdByCredentialLabel: "Release Agent",
      updatedByCredentialId: credential.id,
      updatedByCredentialLabel: "Release Agent",
    },
  });

  await page.goto(`/projects/${fixture.projectId}#epics`);

  const epicArticle = page.getByRole("article", { name: epicName });
  await expect(epicArticle).toBeVisible();
  await clickUntilVisible(
    epicArticle.getByRole("button", { name: `Show details for ${epicName}` }),
    epicArticle.getByRole("button", { name: `Hide details for ${epicName}` })
  );

  const createdBy = epicArticle.locator('[title^="Created by:"]');
  await expect(createdBy).toBeVisible();
  await expect(createdBy).toContainText("Release Agent (agent)");
  await expect(
    createdBy.locator('[data-agent-avatar="true"]')
  ).toBeVisible();
  await expect(
    epicArticle.locator('[title^="Last edited by:"]')
  ).toContainText("Release Agent (agent)");
});
