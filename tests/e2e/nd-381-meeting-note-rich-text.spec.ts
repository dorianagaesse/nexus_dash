import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const userId = await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd381-meeting");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();

  return { userId, projectId: projectId as string, projectName };
}

async function prepareRichMeeting(
  page: import("@playwright/test").Page,
  title: string
) {
  await page.getByRole("button", { name: "Prepare meeting" }).click();
  await page.locator("#meeting-title").fill(title);
  const createMeetingRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/meeting-notes$/.test(response.url()) &&
      response.ok()
  );
  return { createMeetingRequest };
}

async function saveNotesDialog(
  page: import("@playwright/test").Page
): Promise<{ noteId: string }> {
  const updateMeetingRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/meeting-notes\/[^/]+$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Save notes" }).click();
  const response = await updateMeetingRequest;
  return (await response.json()) as { noteId: string };
}

test.describe("ND-381 rich text in meeting note input and output", () => {
  test("round-trips rich formatting from prepare inputs into stored HTML and renders it back", async ({
    page,
  }) => {
    const { projectId } = await openDashboard(page);
    const meetingTitle = uniqueProjectName("rich-prep");

    const { createMeetingRequest } = await prepareRichMeeting(
      page,
      meetingTitle
    );
    const inputsEditor = page.locator("#meeting-inputs");
    await inputsEditor.click();
    await page.keyboard.type("Scope risks:");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- First risk");
    await page.getByRole("button", { name: "Save preparation" }).click();
    await createMeetingRequest;

    const createdNote = await prisma.projectMeetingNote.findFirstOrThrow({
      where: { projectId, title: meetingTitle },
      select: { id: true, inputNotes: true },
    });
    expect(createdNote.inputNotes).toContain("<p>Scope risks:</p>");
    expect(createdNote.inputNotes).toContain("<ul><li>First risk</li></ul>");

    const meetingCard = page.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await expect(meetingCard).toBeVisible();
    await expect(meetingCard).toContainText("Scope risks:");
    await expect(meetingCard).toContainText("First risk");
    await expect(meetingCard).not.toContainText("<ul>");

    await meetingCard.click();
    const meetingDialog = page.getByRole("dialog");
    await expect(meetingDialog).toBeVisible();
    const inputsSection = meetingDialog.getByText("Inputs", { exact: true });
    await expect(inputsSection).toBeVisible();
    await expect(meetingDialog.locator("ul li")).toContainText("First risk");

    const outputsEditor = meetingDialog.locator("#meeting-outputs");
    await outputsEditor.click();
    await page.keyboard.type("Backend aligned.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- Confirm rollout order");
    await saveNotesDialog(page);

    const updatedNote = await prisma.projectMeetingNote.findUniqueOrThrow({
      where: { id: createdNote.id },
      select: { outputNotes: true },
    });
    expect(updatedNote.outputNotes).toContain("<p>Backend aligned.</p>");
    expect(updatedNote.outputNotes).toContain(
      "<ul><li>Confirm rollout order</li></ul>"
    );

    await page.reload();
    await expect(page.getByRole("heading", { name: "Meeting notes" })).toBeVisible();
    const reopenedCard = page.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await reopenedCard.click();
    const reopenedDialog = page.getByRole("dialog");
    await expect(reopenedDialog).toBeVisible();
    await expect(
      reopenedDialog.getByText("First risk", { exact: true })
    ).toBeVisible();
    await expect(
      reopenedDialog.getByText("Confirm rollout order", { exact: true })
    ).toBeVisible();
  });

  test("inserts a project member mention in prepare inputs and renders it read-only with a hover card", async ({
    page,
  }) => {
    const { userId, projectId } = await openDashboard(page);
    // The current user is excluded from mention suggestions, so mention a
    // second member of the project instead.
    const ownerId = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ownerId: true },
    }).then((project) => project.ownerId);
    expect(ownerId).toBe(userId);
    const memberSuffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const memberUser = await prisma.user.create({
      data: {
        email: `mention-${memberSuffix}@nexusdash.local`,
        name: "Mention Member",
        username: memberSuffix.replace(/\D/g, "").slice(0, 12) || "mentionmem",
        usernameDiscriminator: memberSuffix.replace(/\D/g, "").slice(-4).padStart(4, "0"),
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    await prisma.projectMembership.create({
      data: { projectId, userId: memberUser.id, role: "editor" },
    });
    const mentionTarget = await prisma.user.findUniqueOrThrow({
      where: { id: memberUser.id },
      select: { username: true, usernameDiscriminator: true },
    });
    const usernameTag = `${mentionTarget.username}#${mentionTarget.usernameDiscriminator}`;
    const meetingTitle = uniqueProjectName("mention-prep");

    const { createMeetingRequest } = await prepareRichMeeting(
      page,
      meetingTitle
    );
    const inputsEditor = page.locator("#meeting-inputs");
    await inputsEditor.click();
    await page.keyboard.type(`@${mentionTarget.username!.slice(0, 6)}`);
    const mentionOption = page.getByRole("option").filter({
      hasText: new RegExp(`#${mentionTarget.usernameDiscriminator}`),
    });
    await expect(mentionOption).toBeVisible();
    await mentionOption.click();
    await page.keyboard.type(" to review.");
    await page.getByRole("button", { name: "Save preparation" }).click();
    await createMeetingRequest;

    const createdNote = await prisma.projectMeetingNote.findFirstOrThrow({
      where: { projectId, title: meetingTitle },
      select: { inputNotes: true },
    });
    expect(createdNote.inputNotes).toContain(`@${usernameTag}`);

    await page.reload();
    const meetingCard = page.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await meetingCard.click();
    const meetingDialog = page.getByRole("dialog");
    const renderedMention = meetingDialog.locator(
      "[data-rich-mention='true']",
      { hasText: `@${mentionTarget.username}` }
    );
    await expect(renderedMention).toBeVisible();
    await renderedMention.hover();
    const mentionTooltip = page
      .getByRole("tooltip")
      .filter({ hasText: `#${mentionTarget.usernameDiscriminator}` });
    await expect(mentionTooltip).toBeVisible();
  });

  test("keeps legacy plain-text notes readable, searchable, and upgraded on re-save", async ({
    page,
  }) => {
    const { projectId } = await openDashboard(page);
    const owner = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ownerId: true },
    });
    const legacyNote = await prisma.projectMeetingNote.create({
      data: {
        projectId,
        title: uniqueProjectName("legacy-plain"),
        scheduledAt: new Date(),
        status: "actions_in_progress",
        inputNotes: "Legacy line one.\n\nLegacy line two.",
        outputNotes: "Legacy single-line output.",
        createdByUserId: owner.ownerId,
        updatedByUserId: owner.ownerId,
      },
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Meeting notes" })).toBeVisible();
    const legacyCard = page.getByRole("button", {
      name: new RegExp(legacyNote.title),
    });
    await expect(legacyCard).toBeVisible();
    await expect(legacyCard).toContainText("Legacy line one.");
    await expect(legacyCard).toContainText("Legacy line two.");
    await expect(legacyCard).not.toContainText("<p>");

    await page.getByLabel("Search meeting notes").fill("Legacy line two");
    await expect(legacyCard).toBeVisible();
    await page.getByLabel("Search meeting notes").fill("unmatched-search");
    await expect(page.getByText("No matching meeting notes.")).toBeVisible();
    await page.getByLabel("Search meeting notes").fill("");

    await legacyCard.click();
    const meetingDialog = page.getByRole("dialog");
    await expect(meetingDialog).toContainText("Legacy line one.");
    await expect(meetingDialog).toContainText("Legacy line two.");
    await expect(meetingDialog).toContainText("Legacy single-line output.");

    await meetingDialog.getByRole("button", { name: "Edit prep" }).click();
    const inputsEditor = page.locator("#meeting-inputs");
    await expect(inputsEditor.locator("p")).toHaveCount(2);
    await inputsEditor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" — updated.");
    const savePreparationRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/meeting-notes\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Save preparation" }).click();
    await savePreparationRequest;

    const upgradedNote = await prisma.projectMeetingNote.findUniqueOrThrow({
      where: { id: legacyNote.id },
      select: { inputNotes: true },
    });
    expect(upgradedNote.inputNotes).toContain(
      "<p>Legacy line one.</p><p>Legacy line two. — updated.</p>"
    );
  });
});
