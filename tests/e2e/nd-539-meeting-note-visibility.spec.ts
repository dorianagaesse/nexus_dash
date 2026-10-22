import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("ND-539: meeting notes default to private, hide from other members and agents, and allow only the creator to toggle public/private", async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const creatorId = await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd539-visibility");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;

  // Create an agent credential for bearer API verification
  const suffix = Date.now().toString(36);
  const agentLabel = `Visibility bot ${suffix}`;
  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access" }).click();
  await page.locator("#project-agent-label").fill(agentLabel);
  await page.getByRole("button", { name: "Create credential" }).click();
  const apiKeyInput = page.locator(
    `input[aria-label="API key for ${agentLabel}"]`
  );
  await expect(apiKeyInput).toBeVisible();
  const apiKey = await apiKeyInput.inputValue();
  expect(apiKey.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close project settings" }).click();

  const tokenResponse = await page.request.post("/api/auth/agent/token", {
    headers: { Authorization: `ApiKey ${apiKey}` },
  });
  expect(tokenResponse.ok()).toBeTruthy();
  const { accessToken } = (await tokenResponse.json()) as {
    accessToken: string;
  };

  // Sign in a second project editor in an isolated browser context
  const memberContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const memberPage = await memberContext.newPage();

  try {
    const memberId = await signInAsVerifiedUser(memberPage);
    await prisma.projectMembership.create({
      data: {
        projectId: projectIdValue,
        userId: memberId,
        role: "editor",
      },
    });

    // Prepare a new meeting note as creator: visibility defaults to "private"
    const meetingTitle = uniqueProjectName("private-sync");
    await page.getByRole("button", { name: "Prepare meeting" }).click();
    const prepareDialog = page.getByRole("dialog");
    await expect(prepareDialog).toBeVisible();

    const prepareVisibilityToggle = prepareDialog.locator(
      'button[data-meeting-visibility-toggle="private"]'
    );
    await expect(prepareVisibilityToggle).toBeVisible();
    await expect(prepareVisibilityToggle).toHaveText(/private/i);

    await prepareDialog.locator("#meeting-title").fill(meetingTitle);
    const createMeetingResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/meeting-notes$/.test(response.url()) &&
        response.ok()
    );
    await prepareDialog
      .getByRole("button", { name: "Save preparation" })
      .click();
    const createdPayload = (await (await createMeetingResponse).json()) as {
      note: { id: string; visibility: string };
    };
    const noteId = createdPayload.note.id;
    expect(createdPayload.note.visibility).toBe("private");
    expect(creatorId).toBeTruthy();

    // Creator sees the note card with the private badge
    const creatorCard = page.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await expect(creatorCard).toBeVisible();
    await expect(
      creatorCard.locator('[data-meeting-visibility="private"]')
    ).toHaveText(/private/i);

    // Other member and agent cannot list or read the private note
    const memberListPrivate = await memberPage.request.get(
      `/api/projects/${projectIdValue}/meeting-notes`
    );
    expect(memberListPrivate.status()).toBe(200);
    const memberPrivateNotes = (await memberListPrivate.json()) as {
      notes: Array<{ id: string }>;
    };
    expect(memberPrivateNotes.notes.some((n) => n.id === noteId)).toBe(false);

    const memberGetPrivate = await memberPage.request.get(
      `/api/projects/${projectIdValue}/meeting-notes/${noteId}`
    );
    expect(memberGetPrivate.status()).toBe(404);

    const agentListPrivate = await page.request.get(
      `/api/projects/${projectIdValue}/meeting-notes`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(agentListPrivate.status()).toBe(200);
    const agentPrivateNotes = (await agentListPrivate.json()) as {
      notes: Array<{ id: string }>;
    };
    expect(agentPrivateNotes.notes.some((n) => n.id === noteId)).toBe(false);

    // Creator opens note detail dialog and toggles visibility to public ("team")
    await creatorCard.click();
    const detailDialog = page.getByRole("dialog");
    await expect(detailDialog).toBeVisible();
    const detailVisibilityToggle = detailDialog.locator(
      'button[data-meeting-visibility-toggle="private"]'
    );
    await expect(detailVisibilityToggle).toBeVisible();
    await detailVisibilityToggle.click();

    await expect(
      detailDialog.locator('button[data-meeting-visibility-toggle="public"]')
    ).toHaveText(/public/i);

    const patchVisibilityResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/meeting-notes/${noteId}`) &&
        response.ok()
    );
    await detailDialog.getByRole("button", { name: "Save notes" }).click();
    const toggledPayload = (await (await patchVisibilityResponse).json()) as {
      note: { visibility: string };
    };
    expect(toggledPayload.note.visibility).toBe("team");

    // Creator card now displays the public badge
    await expect(
      creatorCard.locator('[data-meeting-visibility="public"]')
    ).toHaveText(/public/i);

    // Now the other member and the agent can see the public ("team") note
    const agentListPublic = await page.request.get(
      `/api/projects/${projectIdValue}/meeting-notes`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(agentListPublic.status()).toBe(200);
    const agentPublicNotes = (await agentListPublic.json()) as {
      notes: Array<{ id: string; visibility: string }>;
    };
    expect(agentPublicNotes.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: noteId, visibility: "team" }),
      ])
    );

    // Non-creator member sees the note and read-only "public" badge, and cannot change visibility
    await memberPage.goto(`/projects/${projectIdValue}`);
    const memberCard = memberPage.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await expect(memberCard).toBeVisible();
    await expect(
      memberCard.locator('[data-meeting-visibility="public"]')
    ).toHaveText(/public/i);

    await memberCard.click();
    const memberDetailDialog = memberPage.getByRole("dialog");
    await expect(memberDetailDialog).toBeVisible();
    await expect(
      memberDetailDialog.locator('[data-meeting-visibility="public"]')
    ).toHaveText(/public/i);
    await expect(
      memberDetailDialog.locator("button[data-meeting-visibility-toggle]")
    ).toHaveCount(0);

    const forbiddenToggle = await memberPage.request.patch(
      `/api/projects/${projectIdValue}/meeting-notes/${noteId}`,
      { data: { visibility: "private" } }
    );
    expect(forbiddenToggle.status()).toBe(403);
    expect(await forbiddenToggle.json()).toEqual({
      error: "forbidden",
    });
  } finally {
    await memberContext.close();
  }
});
