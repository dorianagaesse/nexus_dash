import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("active credential labels appear safely in mention and task-assignee pickers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const ownerId = await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd382-actors");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const suffix = Date.now().toString(36);
  const activeLabel = `Release bot ${suffix}`;
  const revokedLabel = `Revoked bot ${suffix}`;
  const expiredLabel = `Expired bot ${suffix}`;

  await prisma.apiCredential.createMany({
    data: [
      {
        projectId: projectId as string,
        createdByUserId: ownerId,
        label: activeLabel,
        publicId: `nd382-active-${suffix}`,
        secretHash: "not-a-real-secret-hash",
      },
      {
        projectId: projectId as string,
        createdByUserId: ownerId,
        label: revokedLabel,
        publicId: `nd382-revoked-${suffix}`,
        secretHash: "not-a-real-secret-hash",
        revokedAt: new Date(),
        revokedByUserId: ownerId,
      },
      {
        projectId: projectId as string,
        createdByUserId: ownerId,
        label: expiredLabel,
        publicId: `nd382-expired-${suffix}`,
        secretHash: "not-a-real-secret-hash",
        expiresAt: new Date(Date.now() - 60_000),
      },
    ],
  });

  const actorResponse = await page.request.get(
    `/api/projects/${projectId}/actors/search?query=bot`
  );
  expect(actorResponse.ok()).toBeTruthy();
  const actorPayload = (await actorResponse.json()) as {
    actors: Array<Record<string, unknown>>;
  };
  expect(actorPayload.actors).toEqual([
    expect.objectContaining({
      kind: "agent",
      displayName: activeLabel,
      status: "active",
      isAssignable: true,
    }),
  ]);
  expect(JSON.stringify(actorPayload)).not.toContain("secretHash");

  await page.reload();
  await page.getByRole("button", { name: "New task" }).click();
  await page.locator("#task-assignee").click();
  const agentAssignee = page.getByRole("option", {
    name: new RegExp(activeLabel),
  });
  await expect(agentAssignee).toBeVisible();
  await expect(agentAssignee).toBeDisabled();
  await expect(agentAssignee).toContainText("Agent");
  await expect(page.getByText(revokedLabel)).toHaveCount(0);
  await expect(page.getByText(expiredLabel)).toHaveCount(0);

  await page.locator("#task-assignee").click();
  await expect(agentAssignee).toBeHidden();
  const descriptionEditor = page.locator("#task-description");
  await descriptionEditor.click();
  await page.keyboard.type(`@${activeLabel.slice(0, 7)}`);
  const agentMention = page.getByRole("option", {
    name: new RegExp(activeLabel),
  });
  await expect(agentMention).toBeVisible();
  await expect(agentMention).toHaveAttribute("aria-disabled", "true");
  await expect(agentMention).toContainText("Agent");

  const viewerId = await signInAsVerifiedUser(page);
  await prisma.projectMembership.create({
    data: {
      projectId: projectId as string,
      userId: viewerId,
      role: "viewer",
    },
  });
  const viewerActorResponse = await page.request.get(
    `/api/projects/${projectId}/actors/search?query=${encodeURIComponent(activeLabel)}`
  );
  expect(viewerActorResponse.ok()).toBeTruthy();
  await expect(viewerActorResponse.json()).resolves.toEqual({
    actors: [expect.objectContaining({ kind: "agent", displayName: activeLabel })],
  });
});
