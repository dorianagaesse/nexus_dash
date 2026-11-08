import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { createProjectFromProjectsPage, openNewestProjectDashboard, uniqueProjectName } from "./helpers/project-helpers";

test("owner grants survive invitations and restrict UI, direct APIs and assigned work", async ({ page, browser }) => {
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("module-access");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);
  const projectId = page.url().match(/projects\/([^/?#]+)/)![1];
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const memberId = await signInAsVerifiedUser(memberPage);
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  try {
    const invitation = await page.request.post(`/api/projects/${projectId}/sharing`, { data: {
      invitedEmail: member.email, role: "editor", capabilities: ["task:read", "task:write"],
    } });
    expect(invitation.status()).toBe(201);
    const { invitation: invite } = await invitation.json();
    await memberPage.goto(`/invite/project/${invite.invitationId}`);
    await expect(memberPage.getByText("Tasks: read and edit", { exact: true })).toBeVisible();
    const accepted = await memberPage.request.post(`/api/account/invitations/${invite.invitationId}/respond`, { data: { decision: "accept" } });
    expect(accepted.ok()).toBe(true);
    const membership = await prisma.projectMembership.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId: memberId } } });
    expect(membership.capabilities).toEqual(["task:read", "task:write"]);
    await memberPage.goto(`/projects/${projectId}`);
    await expect(memberPage.getByRole("heading", { name: "Kanban board" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "Meeting notes", exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole("heading", { name: "Context cards", exact: true })).toHaveCount(0);
    const created = await memberPage.request.post(`/api/projects/${projectId}/tasks`, { data: { title: "Allowed task" } });
    expect(created.status()).toBe(201);
    const task = await created.json();
    const taskId = task.taskId ?? task.task.id;
    const denied = await memberPage.request.post(`/api/projects/${projectId}/epics`, { data: { name: "Denied epic", description: "Must not be created" } });
    expect(denied.status()).toBe(403);
    const ownerRoute = `/api/projects/${projectId}/sharing/members/${membership.id}`;
    expect((await memberPage.request.patch(ownerRoute, { data: { role: "editor", capabilities: null } })).status()).toBe(403);
    expect((await page.request.patch(ownerRoute, { data: { role: "editor", capabilities: ["task:read"] } })).ok()).toBe(true);
    expect((await memberPage.request.post(`/api/projects/${projectId}/tasks`, { data: { title: "Forbidden task" } })).status()).toBe(403);
    expect((await page.request.patch(`/api/projects/${projectId}/tasks/${taskId}`, { data: { assignee: { kind: "human", id: memberId } } })).ok()).toBe(true);
    expect((await page.request.patch(ownerRoute, { data: { role: "editor", capabilities: [] } })).ok()).toBe(true);
    expect((await memberPage.request.get(`/api/projects/${projectId}/tasks/${taskId}`)).status()).toBe(403);
    await memberPage.reload();
    await expect(memberPage.getByRole("heading", { name: "Kanban board" })).toHaveCount(0);
    // Agent scopes are independent; task write cannot create epics.
    const credentialResponse = await page.request.post(`/api/projects/${projectId}/agent-access`, { data: { label: "Task-only agent", scopes: ["project:read", "task:read", "task:write"] } });
    expect(credentialResponse.status()).toBe(201);
    const credential = await credentialResponse.json();
    const tokenResponse = await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } });
    expect(tokenResponse.ok()).toBe(true);
    const token = (await tokenResponse.json()).accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    expect((await page.request.post(`/api/projects/${projectId}/epics`, { headers, data: { name: "Forbidden agent epic", description: "No implicit task grant" } })).status()).toBe(403);
    expect((await page.request.post(`/api/projects/${projectId}/tasks`, { headers, data: { title: "Allowed agent task" } })).status()).toBe(201);
    // Verify the actual owner controls at desktop and mobile widths.
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await page.getByRole("button", { name: "Contributors", exact: true }).click();
    await page.getByText(`Module access for ${member.username}`, { exact: false }).first().click();
    await expect(page.getByLabel("Tasks access", { exact: true })).toBeVisible();
    await page.getByLabel("Tasks access", { exact: true }).selectOption("write");
    await expect.poll(async () => (await prisma.projectMembership.findUniqueOrThrow({ where: { id: membership.id } })).capabilities).toContain("task:write");
    await page.screenshot({ path: ".tmp/nd130-sharing-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".tmp/nd130-sharing-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await memberContext.close();
  }
});
