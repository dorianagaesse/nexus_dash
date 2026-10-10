import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("my work lists the tasks and todos assigned to the signed-in user", async ({
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
  const suffix = Date.now().toString(36);

  const projectName = uniqueProjectName("nd188-my-work");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);
  const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const projectIdValue = projectId as string;

  // Create an agent credential so the spec can exercise the agent
  // assignee=self queue below.
  const agentLabel = `My work bot ${suffix}`;
  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access" }).click();
  await page.locator("#project-agent-label").fill(agentLabel);
  await page.getByRole("button", { name: "Create credential" }).click();
  const apiKeyInput = page.locator(`input[aria-label="API key for ${agentLabel}"]`);
  await expect(apiKeyInput).toBeVisible();
  const apiKey = await apiKeyInput.inputValue();
  expect(apiKey.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close project settings" }).click();

  const credential = await prisma.apiCredential.findFirst({
    where: { projectId: projectIdValue, label: agentLabel },
    select: { id: true },
  });
  expect(credential).toBeTruthy();
  const credentialId = credential!.id;

  // Task assigned to me through the real create-task picker.
  const assignedTitle = `Assigned to me ${suffix}`;
  await page.getByRole("button", { name: "New task" }).click();
  await page.locator("#task-title").fill(assignedTitle);
  await page.locator("#task-assignee").click();
  await page
    .getByRole("option", { name: new RegExp(ownerUsername) })
    .first()
    .click();
  const createAssignedRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/tasks$/.test(response.url()) &&
      response.ok()
  );
  await page.getByRole("button", { name: "Create task" }).click();
  await createAssignedRequest;

  // Remaining artifacts via the API and prisma so the spec stays focused on
  // my-work behavior rather than task-creation flows.
  const agentTaskTitle = `Agent queue ${suffix}`;
  const agentTaskResponse = await page.request.post(
    `/api/projects/${projectIdValue}/tasks`,
    { data: { title: agentTaskTitle, assignee: { kind: "agent", id: credentialId } } }
  );
  expect(agentTaskResponse.ok()).toBeTruthy();

  const openTitle = `Open pickup ${suffix}`;
  const openTaskResponse = await page.request.post(
    `/api/projects/${projectIdValue}/tasks`,
    { data: { title: openTitle } }
  );
  expect(openTaskResponse.ok()).toBeTruthy();

  const noteTitle = `Planning sync ${suffix}`;
  const todoContent = `Follow up on recap ${suffix}`;
  const meetingNote = await prisma.projectMeetingNote.create({
    data: {
      projectId: projectIdValue,
      title: noteTitle,
      createdByUserId: ownerId,
      updatedByUserId: ownerId,
    },
    select: { id: true },
  });
  await prisma.projectMeetingNoteAction.create({
    data: {
      meetingNoteId: meetingNote.id,
      content: todoContent,
      createdByUserId: ownerId,
      creatorDisplayNameSnapshot: ownerUsername,
      assigneeKind: "human",
      assigneeUserId: ownerId,
      assigneeDisplayNameSnapshot: ownerUsername,
    },
    select: { id: true },
  });

  // Human session API: self filter isolates assigned work, unassigned filter
  // isolates the pickup queue, and invalid params return typed 400s.
  const selfResponse = await page.request.get(
    `/api/projects/${projectIdValue}/tasks?assignee=self&sort=recent&limit=10`
  );
  expect(selfResponse.ok()).toBeTruthy();
  const selfPayload = (await selfResponse.json()) as {
    filters: Record<string, unknown>;
    tasks: Array<{ title: string }>;
  };
  expect(selfPayload.filters).toEqual({
    epicId: null,
    label: null,
    assignee: "self",
    sort: "recent",
    limit: 10,
  });
  const selfTitles = selfPayload.tasks.map((task) => task.title);
  expect(selfTitles).toContain(assignedTitle);
  expect(selfTitles).not.toContain(openTitle);
  expect(selfTitles).not.toContain(agentTaskTitle);

  const unassignedResponse = await page.request.get(
    `/api/projects/${projectIdValue}/tasks?assignee=unassigned`
  );
  expect(unassignedResponse.ok()).toBeTruthy();
  const unassignedPayload = (await unassignedResponse.json()) as {
    tasks: Array<{ title: string }>;
  };
  const unassignedTitles = unassignedPayload.tasks.map((task) => task.title);
  expect(unassignedTitles).toContain(openTitle);
  expect(unassignedTitles).not.toContain(assignedTitle);

  for (const invalidFilter of [
    { query: "assignee=me", error: "invalid-assignee" },
    { query: "sort=oldest", error: "invalid-sort" },
    { query: "limit=nope", error: "invalid-limit" },
  ]) {
    const invalidResponse = await page.request.get(
      `/api/projects/${projectIdValue}/tasks?${invalidFilter.query}`
    );
    expect(invalidResponse.status()).toBe(400);
    expect(await invalidResponse.json()).toEqual({
      error: invalidFilter.error,
    });
  }

  // Agent bearer queue: assignee=self resolves to the credential itself.
  const tokenResponse = await page.request.post("/api/auth/agent/token", {
    headers: { Authorization: `ApiKey ${apiKey}` },
  });
  expect(tokenResponse.ok()).toBeTruthy();
  const tokenPayload = (await tokenResponse.json()) as { accessToken: string };
  expect(tokenPayload.accessToken.length).toBeGreaterThan(0);
  const agentListResponse = await page.request.get(
    `/api/projects/${projectIdValue}/tasks?assignee=self&sort=recent`,
    { headers: { Authorization: `Bearer ${tokenPayload.accessToken}` } }
  );
  expect(agentListResponse.ok()).toBeTruthy();
  const agentListPayload = (await agentListResponse.json()) as {
    filters: Record<string, unknown>;
    tasks: Array<{ title: string }>;
  };
  expect(agentListPayload.filters.assignee).toBe("self");
  const agentTitles = agentListPayload.tasks.map((task) => task.title);
  expect(agentTitles).toEqual([agentTaskTitle]);

  // My work page: a single list of the work assigned to the signed-in user.
  await page.goto("/my-work");
  await expect(
    page.getByRole("heading", { name: "My work", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "My work" }).first()
  ).toHaveAttribute("aria-current", "page");

  const rows = page.locator("[data-my-work-item]");
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole("link", { name: assignedTitle })).toBeVisible();
  await expect(rows.getByRole("link", { name: todoContent })).toBeVisible();
  await expect(rows.getByRole("link", { name: agentTaskTitle })).toHaveCount(0);
  await expect(rows.getByRole("link", { name: openTitle })).toHaveCount(0);
  await expect(rows.getByRole("link", { name: noteTitle })).toHaveCount(0);
  await expect(page.locator("[data-my-work-total]")).toHaveText("2 items");

  // The assignment filters are gone; the type facet narrows the list.
  await expect(
    page.getByRole("link", { name: "Unassigned", exact: true })
  ).toHaveCount(0);
  await page.locator("details[data-my-work-filter='type'] summary").click();
  await page
    .locator("details[data-my-work-filter='type']")
    .getByRole("link", { name: "Todos (1)", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-work\?type=todo/);
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole("link", { name: todoContent })).toBeVisible();

  // Search narrows by title and preserves the other filters.
  await page
    .getByRole("searchbox", { name: "Search my work" })
    .fill(todoContent);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/type=todo/);
  await expect(page).toHaveURL(/q=/);
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole("link", { name: todoContent })).toBeVisible();

  // Deep link: the task row opens the task on its project board.
  await page.goto("/my-work");
  const taskLink = rows.getByRole("link", { name: assignedTitle });
  await expect(taskLink).toBeVisible();
  await taskLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${projectIdValue}\\?taskId=`)
  );
  await expect(page.getByRole("dialog")).toContainText(assignedTitle);
});
