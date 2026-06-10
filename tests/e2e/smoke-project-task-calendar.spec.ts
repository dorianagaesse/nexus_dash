import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test.describe("critical UI smoke flows", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsVerifiedUser(page);
  });

  test("project creation and dashboard navigation flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-project");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page).toHaveURL(/\/projects(\?.*)?$/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  });

  test("task lifecycle and attachment interaction flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-task");
    const createdTaskTitle = uniqueProjectName("task");
    const editedTaskTitle = `${createdTaskTitle}-edited`;
    const taskCommentSuffix = `comment ${uniqueProjectName("note")}`;
    const epicName = uniqueProjectName("epic");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
    expect(projectId).toBeTruthy();
    const projectIdValue = projectId as string;

    const createEpicResponse = await page.request.post(`/api/projects/${projectIdValue}/epics`, {
      data: {
        name: epicName,
        description: "Smoke-test epic for quick assignment coverage.",
      },
    });
    expect(createEpicResponse.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toBeVisible();

    await page.locator("#task-title").fill(createdTaskTitle);
    await page.locator("#task-label-input").fill("smoke");
    await page.locator("#task-label-input").press("Enter");

    await page.getByRole("button", { name: "Open attachment link input" }).click();
    await page.locator("input[placeholder='https://...']").fill("https://example.com");
    await page.locator("input[placeholder='https://...']").press("Enter");
    const createTaskRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/tasks$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Create task" }).click();
    await createTaskRequest;

    const createdTaskCard = page
      .getByRole("button", { name: new RegExp(createdTaskTitle) })
      .first();
    await expect(createdTaskCard).toBeVisible();

    await createdTaskCard.click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    const epicOptionsButton = page.getByRole("button", { name: "Epic options" });
    await epicOptionsButton.click();
    const epicOptionsGroup = page.locator("[data-task-options-submenu='epic']");
    await expect(epicOptionsGroup).toBeVisible();
    const epicOptionButtons = epicOptionsGroup.getByRole("button");
    await expect(epicOptionButtons).toHaveCount(2);
    const quickEpicUpdateRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    const epicOption = epicOptionsGroup.getByRole("button", {
      name: new RegExp(epicName),
    });
    await expect(epicOption).toBeEnabled();
    await epicOption.click();
    await quickEpicUpdateRequest;
    await expect(page.getByText(`Epic updated to ${epicName}.`)).toBeVisible();

    await page.getByRole("button", { name: "Task options" }).click();
    const assigneeOptionsButton = page.getByRole("button", { name: "Assignee options" });
    await assigneeOptionsButton.click();
    const assigneeSubmenu = page.locator("[data-task-options-submenu='assignee']");
    await expect(assigneeSubmenu).toBeVisible();
    const assigneeOptionButtons = assigneeSubmenu.getByRole("button");
    await expect(assigneeOptionButtons).toHaveCount(2);
    const quickAssigneeUpdateRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await assigneeOptionButtons.nth(1).click();
    await quickAssigneeUpdateRequest;
    await expect(page.locator("[data-task-assignee-name='true']")).toBeVisible();

    const mentionUsername = `mention${Date.now().toString().slice(-8)}`;
    const mentionableUser = await prisma.user.create({
      data: {
        email: `${mentionUsername}@nexusdash.local`,
        name: "Mention Test User",
        username: mentionUsername,
        usernameDiscriminator: "1240",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    await prisma.projectMembership.create({
      data: {
        projectId: projectIdValue,
        userId: mentionableUser.id,
        role: "editor",
      },
    });

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByLabel("Task title").fill(editedTaskTitle);
    const descriptionEditor = page.locator("[id^='task-description-editor-']").first();
    await descriptionEditor.click();
    await page.keyboard.type("@");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByRole("option").first().click();
    await expect
      .poll(() =>
        descriptionEditor.evaluate((element) =>
          (element.textContent ?? "")
            .split("")
            .some((character) => character.charCodeAt(0) === 160)
        )
      )
      .toBe(true);
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        descriptionEditor.evaluate((element) => element.querySelectorAll("p").length >= 2)
      )
      .toBe(true);
    await page.keyboard.type("after mention");
    await expect
      .poll(() =>
        descriptionEditor.evaluate((element) =>
          (element.textContent ?? "").includes("after mention")
        )
      )
      .toBe(true);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    const taskSavedToast = page.getByText("Task saved.");
    await expect(taskSavedToast).toBeVisible();
    await expect(taskSavedToast).not.toBeVisible({ timeout: 15000 });

    const commentInput = page.getByLabel("Task comment");
    await commentInput.click();
    await page.keyboard.type(`@${mentionUsername.slice(0, 8)}`);
    await expect(
      page.getByRole("option", { name: new RegExp(mentionUsername) })
    ).toBeVisible();
    await page.getByRole("option", { name: new RegExp(mentionUsername) }).click();
    await page.keyboard.type(taskCommentSuffix);

    const expectedCommentText = `@${mentionUsername} ${taskCommentSuffix}`;
    await expect(commentInput).toHaveValue(expectedCommentText);
    await expect
      .poll(() =>
        commentInput.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement;
          return textarea.selectionStart === textarea.value.length;
        })
      )
      .toBe(true);

    const createCommentRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/comments$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    await createCommentRequest;
    const submittedComment = page
      .locator("article")
      .filter({ hasText: taskCommentSuffix })
      .last();
    await expect(submittedComment).toBeVisible();
    await expect(submittedComment.getByText(`@${mentionUsername}`)).toBeVisible();
    await expect(page.getByText("1 comment", { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        prisma.notification.count({
          where: {
            recipientUserId: mentionableUser.id,
            sourceType: "task_comment_mention",
          },
        })
      )
      .toBe(1);

    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    const deleteAttachmentRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /\/attachments\//.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Delete attachment" }).first().click();
    await deleteAttachmentRequest;
    await expect(page.getByText("example.com")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();

    const editedTaskCard = page
      .getByRole("button", { name: new RegExp(editedTaskTitle) })
      .first();
    await expect(editedTaskCard).toBeVisible();

    await editedTaskCard.click();
    await expect(page.getByRole("button", { name: "Close task" })).toBeVisible();
    await expect(page.getByText(taskCommentSuffix)).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();
  });

  test("context card rich preview flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-context");
    const contextCardTitle = uniqueProjectName("context-card");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill(contextCardTitle);
    await page.locator("#context-create-content").fill("Rich preview line one\nLine two");
    await page.getByRole("button", { name: "Create card" }).click();

    const createdCard = page.locator("article").filter({ hasText: contextCardTitle }).first();
    await expect(createdCard).toBeVisible();

    await createdCard.click();
    await expect(page.getByRole("button", { name: "Close context preview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: contextCardTitle }).last()).toBeVisible();
    await expect(page.getByText("Rich preview line one").last()).toBeVisible();
    await page.getByRole("button", { name: "Close context preview" }).click();
  });

  test("meeting notes preparation, output, and search flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-meeting");
    const meetingTitle = uniqueProjectName("meeting-note");
    const overdueMeetingTitle = uniqueProjectName("overdue-meeting");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
    expect(projectId).toBeTruthy();
    const projectIdValue = projectId as string;

    await expect(page.getByRole("heading", { name: "Meeting notes" })).toBeVisible();

    await page.getByRole("button", { name: "Prepare meeting" }).click();
    await page.locator("#meeting-title").fill(meetingTitle);
    await page.locator("#meeting-participants").fill("Dorian");
    await page.locator("#meeting-participants").press(",");
    await page.locator("#meeting-participants").fill("Camille");
    await page.locator("#meeting-participants").press("Enter");
    await page.locator("#meeting-labels").fill("sync");
    await page.locator("#meeting-labels").press("Enter");
    await page.locator("#meeting-inputs").fill("Review TASK-098 scope and risks.");

    const createMeetingRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/meeting-notes$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Save preparation" }).click();
    await createMeetingRequest;

    const meetingCard = page.getByRole("button", { name: new RegExp(meetingTitle) });
    await expect(meetingCard).toBeVisible();
    await expect(meetingCard.getByText("sync")).toBeVisible();
    await expect(meetingCard.getByText("Prepared")).toBeVisible();

    const overdueMeetingResponse = await page.request.post(
      `/api/projects/${projectIdValue}/meeting-notes`,
      {
        data: {
          title: overdueMeetingTitle,
          scheduledAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          participants: ["Dorian"],
          labels: ["risk"],
          status: "actions_in_progress",
          inputNotes: "Follow-up is overdue by design for smoke coverage.",
          outputNotes: "",
          actions: [
            {
              content: "Finalize delayed recap",
              completedAt: null,
            },
          ],
        },
      }
    );
    expect(overdueMeetingResponse.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Meeting notes" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Meeting notes.*1 overdue/ })
    ).toBeVisible();
    const overdueMeetingCard = page.getByRole("button", {
      name: new RegExp(overdueMeetingTitle),
    });
    await expect(overdueMeetingCard.getByText("1 overdue todo")).toBeVisible();

    await page
      .getByRole("button", { name: "Filter meeting notes by label sync" })
      .click();
    await expect(page.getByRole("button", { name: new RegExp(meetingTitle) })).toBeVisible();
    await expect(page.getByText(overdueMeetingTitle)).toBeHidden();
    await page.getByRole("button", { name: "Clear labels" }).click();

    await page.getByRole("button", { name: new RegExp(meetingTitle) }).click();
    const meetingDialog = page.getByRole("dialog");
    await expect(meetingDialog).toBeVisible();
    await expect(
      meetingDialog.getByText("Review TASK-098 scope and risks.")
    ).toBeVisible();
    await page.locator("#meeting-outputs").fill("Backend alignment confirmed.");
    await meetingDialog.getByRole("button", { name: "Add", exact: true }).click();
    await meetingDialog
      .getByRole("textbox", { name: "Todo 1" })
      .fill("Send recap to stakeholders");
    await page.getByLabel("Complete todo 1").click();
    await meetingDialog.getByRole("button", { name: "Meeting state" }).click();
    await page.getByRole("option", { name: /Done/ }).click();

    const updateMeetingRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/meeting-notes\/[^/]+$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Save notes" }).click();
    await updateMeetingRequest;

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Archived (1)")).toBeVisible();
    const archivedMeetingCard = page.getByRole("button", {
      name: new RegExp(meetingTitle),
    });
    await expect(archivedMeetingCard.getByText("Done")).toBeVisible();
    await expect(archivedMeetingCard.getByText("1/1")).toBeVisible();

    await page.getByLabel("Search meeting notes").fill("stakeholders");
    await expect(page.getByText(meetingTitle)).toBeVisible();

    await page.getByLabel("Search meeting notes").fill("not-a-real-meeting");
    await expect(page.getByText("No matching meeting notes.")).toBeVisible();
  });

  test("roadmap event-first milestone flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-roadmap");
    const firstEventTitle = uniqueProjectName("roadmap-event-1");
    const secondEventTitle = uniqueProjectName("roadmap-event-2");
    const thirdEventTitle = uniqueProjectName("roadmap-event-3");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "New event" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#roadmap-entity-title").fill(firstEventTitle);
    await page.locator("#roadmap-entity-description").fill("First roadmap event for smoke coverage.");
    await page.getByRole("button", { name: "Create event" }).last().click();

    const milestoneOneLane = page.locator("[data-roadmap-milestone='1']");
    await expect(milestoneOneLane).toContainText(firstEventTitle);
    await expect(page.getByText("1 milestone")).toBeVisible();

    await page.getByRole("button", { name: "New event" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#roadmap-entity-title").fill(secondEventTitle);
    await page.locator("#roadmap-entity-description").fill("Second roadmap event in a new milestone.");
    await page.getByRole("button", { name: "Create event" }).last().click();

    const milestoneTwoLane = page.locator("[data-roadmap-milestone='2']");
    await expect(milestoneTwoLane).toContainText(secondEventTitle);
    await expect(page.getByText("2 milestones")).toBeVisible();

    await page.getByRole("button", { name: "New event" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#roadmap-entity-title").fill(thirdEventTitle);
    await page.locator("#roadmap-entity-description").fill("Third roadmap event that will be dragged into milestone two.");
    await page.getByRole("button", { name: "Create event" }).last().click();

    const milestoneThreeLane = page.locator("[data-roadmap-milestone='3']");
    await expect(milestoneThreeLane).toContainText(thirdEventTitle);

    const sourceCard = milestoneThreeLane.locator("[data-roadmap-event-card]").first();
    const sourceHandle = milestoneThreeLane.locator("[data-roadmap-event-drag-handle]").first();
    const targetDropzone = milestoneTwoLane.locator("[data-roadmap-lane-dropzone]").first();

    await sourceCard.scrollIntoViewIfNeeded();
    await sourceHandle.scrollIntoViewIfNeeded();

    const sourceCardBox = await sourceCard.boundingBox();
    const sourceHandleBox = await sourceHandle.boundingBox();
    const targetDropzoneBox = await targetDropzone.boundingBox();

    expect(sourceCardBox).toBeTruthy();
    expect(sourceHandleBox).toBeTruthy();
    expect(targetDropzoneBox).toBeTruthy();

    const handleCenterX = sourceHandleBox!.x + sourceHandleBox!.width / 2;
    const handleCenterY = sourceHandleBox!.y + sourceHandleBox!.height / 2;
    const handleOffsetX = handleCenterX - sourceCardBox!.x;
    const handleOffsetY = handleCenterY - sourceCardBox!.y;
    const desiredCardX = targetDropzoneBox!.x + 18;
    const desiredCardY = targetDropzoneBox!.y + 14;
    const targetCursorX = desiredCardX + handleOffsetX;
    const targetCursorY = desiredCardY + handleOffsetY;

    const roadmapMoveRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/roadmap\/events\/move$/.test(response.url())
    );
    await page.mouse.move(handleCenterX, handleCenterY);
    await page.mouse.down();
    await page.mouse.move(handleCenterX + 12, handleCenterY + 8, { steps: 8 });
    await page.mouse.move(targetCursorX, targetCursorY, { steps: 24 });
    await page.mouse.up();
    const roadmapMoveResponse = await roadmapMoveRequest;
    expect(roadmapMoveResponse.ok()).toBeTruthy();

    await expect(page.getByText("2 milestones")).toBeVisible();
    await expect(milestoneTwoLane).toContainText(secondEventTitle);
    await expect(milestoneTwoLane).toContainText(thirdEventTitle);

    await milestoneTwoLane
      .locator("article")
      .filter({ hasText: thirdEventTitle })
      .getByRole("button", { name: "View" })
      .click();
    const roadmapDetailDialog = page.getByRole("dialog");
    await expect(
      roadmapDetailDialog.getByRole("heading", { name: thirdEventTitle })
    ).toBeVisible();
    await expect(
      roadmapDetailDialog.getByText("Milestone 2", { exact: true }).last()
    ).toBeVisible();
    await roadmapDetailDialog.getByRole("button", { name: "Close", exact: true }).click();
  });

  test("calendar panel interaction flow", async ({ page }) => {
    const projectName = uniqueProjectName("smoke-calendar");

    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    await page.getByRole("button", { name: "Calendar" }).click();

    const disconnectedState = page.getByText("Connect Google Calendar to show events here.");
    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await expect(disconnectedState.or(refreshButton)).toBeVisible();

    if (await disconnectedState.isVisible()) {
      await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
      return;
    }

    await refreshButton.click();
    const syncedState = page
      .getByText(/^Synced /)
      .or(page.getByText("Connected"))
      .or(page.getByText("No events in the current week."));
    await expect(syncedState.first()).toBeVisible();
  });
});
