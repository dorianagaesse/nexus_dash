import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "../../lib/resource-type";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("owners review and unassign active responsibility before removing a collaborator", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const ownerId = await signInAsVerifiedUser(page);
  const suffix = uniqueSuffix();
  const member = await prisma.user.create({
    data: {
      email: `nd179-member-${suffix}@nexusdash.local`,
      name: "Morgan Offboarding",
      username: `morgan${suffix.replace(/\D/g, "").slice(-6)}`,
      usernameDiscriminator: "1790",
      emailVerified: new Date(),
    },
    select: {
      id: true,
      name: true,
      username: true,
      usernameDiscriminator: true,
    },
  });
  const memberLabel = `${member.username}#${member.usernameDiscriminator}`;
  const project = await prisma.project.create({
    data: {
      name: `ND-179 continuity ${suffix}`,
      ownerId,
      memberships: {
        create: [
          { userId: ownerId, role: "owner" },
          { userId: member.id, role: "editor" },
        ],
      },
    },
    select: { id: true },
  });
  const task = await prisma.task.create({
    data: {
      title: "Active collaborator task",
      projectId: project.id,
      status: "In Progress",
      position: 0,
      createdByUserId: member.id,
      updatedByUserId: member.id,
      assigneeUserId: member.id,
    },
    select: { id: true },
  });
  const contextCard = await prisma.resource.create({
    data: {
      projectId: project.id,
      type: RESOURCE_TYPE_CONTEXT_CARD,
      name: "Continuity context",
      content: "Keep this context after access changes.",
      createdByUserId: member.id,
      creatorKind: "human",
      creatorDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
      lastEditedByUserId: member.id,
      lastEditorKind: "human",
      lastEditorDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
      stewardUserId: member.id,
      stewardKind: "human",
      stewardDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
    },
    select: { id: true },
  });
  const meetingNote = await prisma.projectMeetingNote.create({
    data: {
      projectId: project.id,
      title: "Continuity meeting",
      status: "prepared",
      createdByUserId: member.id,
      updatedByUserId: member.id,
      stewardUserId: member.id,
      stewardKind: "human",
      stewardDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
      actions: {
        create: {
          content: "Follow up on ownership",
          creatorKind: "human",
          createdByUserId: member.id,
          creatorDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
          assigneeUserId: member.id,
          assigneeKind: "human",
          assigneeDisplayNameSnapshot: member.name ?? "Morgan Offboarding",
        },
      },
    },
    select: { id: true, actions: { select: { id: true } } },
  });

  try {
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Contributors" }).click();
    await expect(page.getByText(memberLabel)).toBeVisible();

    const memberRow = page
      .getByText(memberLabel)
      .locator("xpath=ancestor::div[.//button[normalize-space()='Remove']][1]");

    await memberRow.getByRole("button", { name: "Transfer ownership" }).click();
    const transferDialog = page.getByRole("dialog", {
      name: `Transfer ownership to ${memberLabel}?`,
    });
    await expect(transferDialog).toBeVisible();
    await expect(transferDialog.getByLabel("Stay as editor")).toBeChecked();
    await expect(transferDialog.getByLabel("Leave project")).not.toBeChecked();
    await transferDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(transferDialog).toBeHidden();
    await expect(
      page.getByRole("dialog", { name: new RegExp("^Project settings:") })
    ).toBeVisible();

    const refreshedMemberRow = page
      .getByText(memberLabel)
      .locator("xpath=ancestor::div[.//button[normalize-space()='Remove']][1]");
    await refreshedMemberRow.getByRole("button", { name: "Remove" }).click();

    const dialog = page.getByRole("dialog", {
      name: `Remove ${memberLabel}?`,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("4 total")).toBeVisible();
    await expect(dialog.getByText("Active task assignments")).toBeVisible();
    await expect(dialog.getByText("Context cards")).toBeVisible();
    await expect(dialog.getByText("Active meeting notes")).toBeVisible();
    await expect(dialog.getByText("Open meeting todos")).toBeVisible();

    const horizontalOverflow = await dialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    );
    expect(horizontalOverflow).toBe(false);
    const confirmButton = dialog.getByRole("button", {
      name: "Remove collaborator",
    });
    expect((await confirmButton.boundingBox())?.height).toBeGreaterThanOrEqual(
      44
    );

    await dialog.getByLabel("Leave active work unassigned").check();
    await confirmButton.click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(`${memberLabel} removed from the project.`)
    ).toBeVisible();

    await page.getByRole("button", { name: "Close project settings" }).click();

    const meetingNoteCard = page.getByRole("button", {
      name: /Continuity meeting/,
    });
    await expect(meetingNoteCard.getByText("Steward unassigned")).toBeVisible();

    await page.getByRole("button", { name: "Project context 1 card" }).click();
    const contextCardElement = page
      .getByRole("heading", { name: "Continuity context" })
      .locator("xpath=ancestor::article[1]");
    await expect(contextCardElement.getByText("Steward: Unassigned")).toBeVisible();

    await page.getByRole("button", { name: "Next list: In Progress" }).click();
    const taskCard = page.locator(`[data-kanban-task-card="${task.id}"]`);
    await expect(taskCard.getByText(member.name ?? "Morgan Offboarding")).toHaveCount(0);
    await taskCard.click();
    await expect(
      page.locator('[data-task-assignee-badge="true"]').getByText("Unassigned")
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await meetingNoteCard.click();
    await expect(
      page.locator(`#meeting-todo-assignee-${meetingNote.actions[0].id}`)
    ).toHaveAttribute("aria-label", "Change meeting todo assignee");
    await page.keyboard.press("Escape");

    const [
      membership,
      storedTask,
      storedContextCard,
      storedMeetingNote,
      storedAction,
    ] = await Promise.all([
      prisma.projectMembership.findFirst({
        where: { projectId: project.id, userId: member.id },
      }),
      prisma.task.findUnique({ where: { id: task.id } }),
      prisma.resource.findUnique({ where: { id: contextCard.id } }),
      prisma.projectMeetingNote.findUnique({ where: { id: meetingNote.id } }),
      prisma.projectMeetingNoteAction.findUnique({
        where: { id: meetingNote.actions[0].id },
      }),
    ]);
    expect(membership).toBeNull();
    expect(storedTask?.assigneeUserId).toBeNull();
    expect(storedTask?.createdByUserId).toBe(member.id);
    expect(storedContextCard?.stewardUserId).toBeNull();
    expect(storedContextCard?.createdByUserId).toBe(member.id);
    expect(storedContextCard?.lastEditedByUserId).toBe(member.id);
    expect(storedMeetingNote?.stewardUserId).toBeNull();
    expect(storedMeetingNote?.createdByUserId).toBe(member.id);
    expect(storedAction?.assigneeUserId).toBeNull();
    expect(storedAction?.createdByUserId).toBe(member.id);
  } finally {
    await prisma.project
      .delete({ where: { id: project.id } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: member.id } })
      .catch(() => undefined);
  }
});
