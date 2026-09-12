import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("agent assignment persists credential identity with audit history and inactive states", async ({
  page,
}) => {
  const ownerId = await signInAsVerifiedUser(page);
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { username: true },
  });
  if (!owner?.username) {
    throw new Error("Signed-in e2e user is missing a username");
  }
  const ownerUsername = owner.username;

  const projectName = uniqueProjectName("nd384-agent-assignment");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);

  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;
  const suffix = Date.now().toString(36);
  const agentLabel = `Assignable bot ${suffix}`;
  const taskTitle = `Agent assigned task ${suffix}`;
  const todoContent = `Assign agent follow-up ${suffix}`;

  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access" }).click();
  await page.locator("#project-agent-label").fill(agentLabel);
  await page.getByRole("button", { name: "Create credential" }).click();
  await expect(page.getByText("Copy the new API key now")).toBeVisible();
  await page.getByRole("button", { name: "Close project settings" }).click();

  const credential = await prisma.apiCredential.findFirst({
    where: { projectId: projectIdValue, label: agentLabel },
    select: { id: true },
  });
  expect(credential).toBeTruthy();
  const credentialId = credential!.id;

  // Task-side: create a task assigned to the agent and verify persisted
  // credential identity plus who assigned it and when.
  await page.getByRole("button", { name: "New task" }).click();
  await page.locator("#task-title").fill(taskTitle);
  await page.locator("#task-assignee").click();
  const agentAssigneeOption = page.getByRole("option", {
    name: new RegExp(agentLabel),
  });
  await expect(agentAssigneeOption).toBeVisible();
  await expect(agentAssigneeOption).toBeEnabled();
  await agentAssigneeOption.click();
  const createTaskRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/tasks$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create task" }).click();
  await createTaskRequest;

  const listResponse = await page.request.get(
    `/api/projects/${projectIdValue}/tasks`
  );
  expect(listResponse.ok()).toBeTruthy();
  const listPayload = (await listResponse.json()) as {
    tasks: Array<{
      id: string;
      title: string;
      assignee: {
        kind: string;
        id: string;
        status: string;
        isAssignable: boolean;
      } | null;
      assignedBy: { kind: string; id: string } | null;
      assignedAt: string | null;
    }>;
  };
  const createdTask = listPayload.tasks.find((task) => task.title === taskTitle);
  expect(createdTask).toBeTruthy();
  const taskId = createdTask!.id;
  expect(createdTask!.assignee).toMatchObject({
    kind: "agent",
    id: credentialId,
    status: "active",
    isAssignable: true,
  });
  expect(createdTask!.assignedBy).toMatchObject({
    kind: "human",
    id: ownerId,
  });
  expect(createdTask!.assignedAt).toBeTruthy();

  const initialTaskHistory = await prisma.taskAssigneeChange.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  expect(initialTaskHistory).toHaveLength(1);
  expect(initialTaskHistory[0]).toMatchObject({
    previousAssigneeKind: null,
    previousAssigneeCredentialId: null,
    nextAssigneeKind: "agent",
    nextAssigneeCredentialId: credentialId,
    nextAssigneeUserId: null,
    changedByKind: "human",
    changedByUserId: ownerId,
    changedByCredentialId: null,
  });

  await page.reload();
  const taskCard = page
    .getByRole("button", { name: new RegExp(taskTitle) })
    .first();
  await expect(taskCard).toBeVisible();
  await taskCard.click();
  const assigneeBadge = page.locator("[data-task-assignee-badge='true']");
  await expect(assigneeBadge.locator("[data-task-assignee-name='true']")).toHaveText(
    agentLabel
  );
  await expect(assigneeBadge.getByText("agent", { exact: true })).toBeVisible();
  await expect(assigneeBadge.getByLabel("Needs reassignment")).toHaveCount(0);

  // Meeting-todo side: assign an existing open todo to the agent and verify
  // the same provenance guarantees.
  const meetingNote = await prisma.projectMeetingNote.create({
    data: {
      projectId: projectIdValue,
      title: `Agent todo meeting ${suffix}`,
      createdByUserId: ownerId,
      updatedByUserId: ownerId,
    },
    select: { id: true },
  });
  const todoAction = await prisma.projectMeetingNoteAction.create({
    data: {
      meetingNoteId: meetingNote.id,
      content: todoContent,
      createdByUserId: ownerId,
      creatorDisplayNameSnapshot: ownerUsername,
    },
    select: { id: true },
  });

  await page.goto(`/projects/${projectIdValue}/todos`);
  const todoChip = page.locator(`#project-todo-assignee-${todoAction.id}`);
  await expect(todoChip).toBeVisible();
  await expect(todoChip).toContainText("Unassigned");
  await todoChip.click();
  const agentTodoOption = page.getByRole("option", {
    name: new RegExp(agentLabel),
  });
  await expect(agentTodoOption).toBeVisible();
  const todoAssignRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/meeting-notes\/[^/]+\/actions\/[^/]+$/.test(response.url()) &&
      response.ok()
  );
  await agentTodoOption.click();
  await todoAssignRequest;
  await expect(page.getByText(`Assigned to ${agentLabel}.`)).toBeVisible();
  await expect(todoChip).toContainText(agentLabel);

  const assignedTodo = await prisma.projectMeetingNoteAction.findUnique({
    where: { id: todoAction.id },
  });
  expect(assignedTodo).toMatchObject({
    assigneeKind: "agent",
    assigneeCredentialId: credentialId,
    assigneeUserId: null,
    assignedByKind: "human",
    assignedByUserId: ownerId,
    assignedByCredentialId: null,
  });
  expect(assignedTodo!.assignedAt).toBeTruthy();

  const initialTodoHistory =
    await prisma.projectMeetingNoteActionAssigneeChange.findMany({
      where: { actionId: todoAction.id },
      orderBy: { createdAt: "asc" },
    });
  expect(initialTodoHistory).toHaveLength(1);
  expect(initialTodoHistory[0]).toMatchObject({
    previousAssigneeKind: null,
    nextAssigneeKind: "agent",
    nextAssigneeCredentialId: credentialId,
    nextAssigneeUserId: null,
    changedByKind: "human",
    changedByUserId: ownerId,
  });

  // Revoking the credential must block new assignments while existing work
  // stays discoverable for reassignment.
  await prisma.apiCredential.update({
    where: { id: credentialId },
    data: { revokedAt: new Date(), revokedByUserId: ownerId },
  });

  const rejectedCreate = await page.request.post(
    `/api/projects/${projectIdValue}/tasks`,
    {
      data: {
        title: `Rejected task ${suffix}`,
        assignee: { kind: "agent", id: credentialId },
      },
    }
  );
  expect(rejectedCreate.status()).toBe(400);

  await page.goto(`/projects/${projectIdValue}`);
  const revokedTaskCard = page
    .getByRole("button", { name: new RegExp(taskTitle) })
    .first();
  await expect(revokedTaskCard).toBeVisible();
  await revokedTaskCard.click();
  const revokedBadge = page.locator("[data-task-assignee-badge='true']");
  await expect(revokedBadge.locator("[data-task-assignee-name='true']")).toHaveText(
    agentLabel
  );
  await expect(revokedBadge.getByLabel("Needs reassignment")).toBeVisible();

  await page.getByRole("button", { name: "Task options" }).click();
  await page.getByRole("button", { name: "Assignee options" }).click();
  const assigneeSubmenu = page.locator("[data-task-options-submenu='assignee']");
  await expect(assigneeSubmenu).toBeVisible();
  await expect(
    assigneeSubmenu.getByRole("button", { name: new RegExp(agentLabel) })
  ).toHaveCount(0);
  const quickAssigneeUpdateRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/tasks\/[^/]+$/.test(response.url()) &&
      response.ok()
  );
  await assigneeSubmenu
    .getByRole("button", { name: new RegExp(ownerUsername) })
    .click();
  await quickAssigneeUpdateRequest;
  await expect(revokedBadge.locator("[data-task-assignee-name='true']")).toHaveText(
    ownerUsername
  );
  await expect(revokedBadge.getByLabel("Needs reassignment")).toHaveCount(0);
  await page.getByRole("button", { name: "Close task" }).click();

  const reassignedListResponse = await page.request.get(
    `/api/projects/${projectIdValue}/tasks`
  );
  expect(reassignedListResponse.ok()).toBeTruthy();
  const reassignedListPayload = (await reassignedListResponse.json()) as {
    tasks: Array<{
      id: string;
      assignee: { kind: string; id: string; status: string } | null;
      assignedBy: { kind: string; id: string } | null;
      assignedAt: string | null;
    }>;
  };
  const reassignedTask = reassignedListPayload.tasks.find(
    (task) => task.id === taskId
  );
  expect(reassignedTask).toBeTruthy();
  expect(reassignedTask!.assignee).toMatchObject({
    kind: "human",
    id: ownerId,
    status: "active",
  });
  expect(reassignedTask!.assignedBy).toMatchObject({
    kind: "human",
    id: ownerId,
  });
  expect(reassignedTask!.assignedAt).toBeTruthy();

  const reassignedTaskHistory = await prisma.taskAssigneeChange.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  expect(reassignedTaskHistory).toHaveLength(2);
  expect(reassignedTaskHistory[1]).toMatchObject({
    previousAssigneeKind: "agent",
    previousAssigneeCredentialId: credentialId,
    previousAssigneeUserId: null,
    nextAssigneeKind: "human",
    nextAssigneeUserId: ownerId,
    nextAssigneeCredentialId: null,
    changedByKind: "human",
    changedByUserId: ownerId,
  });

  // Revoked agents drop out of the open todo picker, and the todo itself can be
  // reassigned to a human.
  await page.goto(`/projects/${projectIdValue}/todos`);
  const revokedChip = page.locator(`#project-todo-assignee-${todoAction.id}`);
  await expect(revokedChip).toBeVisible();
  await expect(revokedChip).toHaveAttribute("data-needs-reassignment", "true");
  await expect(revokedChip).toContainText(agentLabel);
  await revokedChip.click();
  await expect(
    page.getByRole("option", { name: new RegExp(agentLabel) })
  ).toHaveCount(0);
  const todoReassignRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/meeting-notes\/[^/]+\/actions\/[^/]+$/.test(response.url()) &&
      response.ok()
  );
  await page
    .getByRole("option", { name: new RegExp(ownerUsername) })
    .click();
  await todoReassignRequest;
  await expect(page.getByText(`Assigned to ${ownerUsername}.`)).toBeVisible();
  await expect(revokedChip).not.toHaveAttribute(
    "data-needs-reassignment",
    "true"
  );
  await expect(revokedChip).toContainText(ownerUsername);

  const reassignedTodo = await prisma.projectMeetingNoteAction.findUnique({
    where: { id: todoAction.id },
  });
  expect(reassignedTodo).toMatchObject({
    assigneeKind: "human",
    assigneeUserId: ownerId,
    assigneeCredentialId: null,
    assignedByKind: "human",
    assignedByUserId: ownerId,
  });

  const reassignedTodoHistory =
    await prisma.projectMeetingNoteActionAssigneeChange.findMany({
      where: { actionId: todoAction.id },
      orderBy: { createdAt: "asc" },
    });
  expect(reassignedTodoHistory).toHaveLength(2);
  expect(reassignedTodoHistory[1]).toMatchObject({
    previousAssigneeKind: "agent",
    previousAssigneeCredentialId: credentialId,
    previousAssigneeUserId: null,
    nextAssigneeKind: "human",
    nextAssigneeUserId: ownerId,
    nextAssigneeCredentialId: null,
    changedByKind: "human",
    changedByUserId: ownerId,
  });
});
