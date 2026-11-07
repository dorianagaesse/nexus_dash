import { copyAndCloseAgentKey } from "./helpers/agent-access-helpers";
import { expect, test } from "@playwright/test";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { createProjectFromProjectsPage, openNewestProjectDashboard, uniqueProjectName } from "./helpers/project-helpers";
import { prisma } from "../../lib/prisma";

test("owner grants Done moves to one credential with immediate token enforcement", async ({ page }) => {
  const ownerId = await signInAsVerifiedUser(page);
  const name = uniqueProjectName("nd654");
  await createProjectFromProjectsPage(page, name);
  await openNewestProjectDashboard(page, name);
  const projectId = page.url().match(/\/projects\/([^/?#]+)/)![1];
  const root = `/api/projects/${projectId}`;
  const createdTask = await page.request.post(`${root}/tasks`, { data: { title: "Policy test" } });
  expect(createdTask.ok()).toBeTruthy();
  const { task } = await createdTask.json();
  const path = `${root}/tasks/${task.id}/status`;
  const columns = [{ status: "Done", taskIds: [task.id] }];

  // Create the trusted credential through the owner UI; its permission starts off.
  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access", exact: true }).click();
  await page.getByRole("button", { name: "New credential", exact: true }).click();
  await page.locator("#project-agent-label").fill("Trusted bot");
  await page.getByRole("button", { name: "Create credential", exact: true }).click();
  const key = page.getByRole("textbox", { name: "API key for Trusted bot", exact: true });
  await expect(key).toBeVisible();
  const exchange = await page.request.post("/api/auth/agent/token", { headers: { Authorization: `ApiKey ${await key.inputValue()}` } });
  expect(exchange.ok()).toBeTruthy();
  const { accessToken } = await exchange.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  await copyAndCloseAgentKey(page);
  const toggle = page.getByRole("switch", { name: "Allow Trusted bot to move tasks to Done", exact: true });
  await expect(toggle).not.toBeChecked();

  const otherCreated = await page.request.post(`${root}/agent-access`, { data: { label: "Other bot", scopes: ["task:read", "task:write"] } });
  expect(otherCreated.ok()).toBeTruthy();
  const other = await otherCreated.json();
  expect(other.credential.canMoveTasksToDone).toBe(false);
  const otherExchange = await page.request.post("/api/auth/agent/token", { data: { apiKey: other.apiKey } });
  const otherHeaders = { Authorization: `Bearer ${(await otherExchange.json()).accessToken}` };

  for (const agentHeaders of [headers, otherHeaders]) {
    const denied = await page.request.post(path, { headers: agentHeaders, data: { status: "Done" } });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toEqual({ error: "agent-done-move-disabled" });
    expect((await page.request.post(`${root}/tasks/reorder`, { headers: agentHeaders, data: { columns } })).status()).toBe(403);
    const bulk = await page.request.post(`${root}/tasks/bulk`, {
      headers: agentHeaders, data: { operations: [{ type: "status", taskId: task.id, status: "Done" }] },
    });
    expect((await bulk.json()).results).toEqual([
      { index: 0, ok: false, status: 403, error: "agent-done-move-disabled" },
    ]);
  }
  const current = await page.request.get(`${root}/tasks`);
  expect((await current.json()).tasks.find((entry: { id: string }) => entry.id === task.id).status).toBe("Backlog");
  expect((await page.request.post(path, { data: { status: "Done" } })).ok()).toBeTruthy();
  expect((await page.request.post(path, { data: { status: "Backlog" } })).ok()).toBeTruthy();

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
  await expect(page.getByText("Agent capabilities saved.", { exact: true })).toBeVisible();
  const summary = await (await page.request.get(`${root}/agent-access`)).json();
  const trusted = summary.credentials.find((entry: { label: string }) => entry.label === "Trusted bot");
  expect(trusted.canMoveTasksToDone).toBe(true);
  expect(summary.recentEvents.some((event: { action: string; credentialId: string }) =>
    event.action === "credential_capabilities_updated" && event.credentialId === trusted.id
  )).toBe(true);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("Credential capabilities updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Credentials", exact: true }).click();
  const audit = await prisma.authAuditEvent.findFirstOrThrow({
    where: { credentialId: trusted.id, action: "credential_capabilities_updated" },
    orderBy: { createdAt: "desc" },
  });
  expect(audit.actorUserId).toBe(ownerId);
  expect(audit.actorKind).toBe("human");
  expect(audit.metadata).toEqual({ canMoveTasksToDone: true });
  expect(audit.requestId).toBeTruthy();
  expect(summary.credentials.find((entry: { id: string }) => entry.id === other.credential.id).canMoveTasksToDone).toBe(false);
  expect(summary).not.toHaveProperty("agentCanMoveTasksToDone");
  expect((await page.request.post(path, { headers: otherHeaders, data: { status: "Done" } })).status()).toBe(403);
  expect((await page.request.post(path, { headers, data: { status: "Done" } })).ok()).toBeTruthy();
  expect((await page.request.post(path, { data: { status: "Backlog" } })).ok()).toBeTruthy();
  expect((await page.request.post(`${root}/tasks/reorder`, { headers, data: { columns } })).ok()).toBeTruthy();

  // The same bearer token loses permission immediately after the owner disables it.
  await page.reload();
  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access", exact: true }).click();
  await expect(toggle).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  expect((await page.request.post(path, { data: { status: "Backlog" } })).ok()).toBeTruthy();
  expect((await page.request.post(path, { headers, data: { status: "Done" } })).status()).toBe(403);
  const capabilityPath = `${root}/agent-access/${trusted.id}`;
  expect((await page.request.patch(capabilityPath, { headers, data: { canMoveTasksToDone: true } })).status()).toBe(401);

  // A grant never bypasses expiry or revocation, including for already-issued tokens.
  expect((await page.request.patch(capabilityPath, { data: { canMoveTasksToDone: true } })).ok()).toBeTruthy();
  await prisma.apiCredential.update({ where: { id: trusted.id }, data: { expiresAt: new Date(0) } });
  expect((await page.request.post(path, { headers, data: { status: "Done" } })).status()).toBe(401);
  await prisma.apiCredential.update({ where: { id: trusted.id }, data: { expiresAt: null, revokedAt: new Date() } });
  expect((await page.request.post(path, { headers, data: { status: "Done" } })).status()).toBe(401);
});

for (const previousOwnerLeaves of [false, true]) {
  test(`new owner manages inherited credential permissions (previous owner leaves: ${previousOwnerLeaves})`, async ({ page, browser }, testInfo) => {
    const previousOwnerId = await signInAsVerifiedUser(page);
    const created = await page.request.post("/api/projects", { data: { name: uniqueProjectName("nd654-transfer") } });
    expect(created.ok()).toBeTruthy();
    const { project } = await created.json();
    const root = `/api/projects/${project.id}`;
    const issued = await page.request.post(`${root}/agent-access`, {
      data: { label: "Inherited bot", scopes: ["task:read", "task:write"] },
    });
    expect(issued.ok()).toBeTruthy();
    const { credential } = await issued.json();
    const otherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    try {
      const newOwnerPage = await otherContext.newPage();
      const newOwnerId = await signInAsVerifiedUser(newOwnerPage);
      const membership = await prisma.projectMembership.create({
        data: { projectId: project.id, userId: newOwnerId, role: "editor" },
      });
      const transferred = await page.request.post(`${root}/ownership/transfer`, {
        data: { newOwnerMembershipId: membership.id, previousOwnerLeaves },
      });
      expect(transferred.ok(), await transferred.text()).toBeTruthy();
      const capabilityPath = `${root}/agent-access/${credential.id}`;
      const summary = await newOwnerPage.request.get(`${root}/agent-access`);
      expect(summary.ok()).toBeTruthy();
      expect((await summary.json()).credentials[0].id).toBe(credential.id);
      for (const allowed of [true, false]) {
        const update = await newOwnerPage.request.patch(capabilityPath, {
          data: { canMoveTasksToDone: allowed },
        });
        expect(update.status(), await update.text()).toBe(200);
        const saved = await prisma.apiCredential.findUniqueOrThrow({ where: { id: credential.id } });
        expect(saved.canMoveTasksToDone).toBe(allowed);
        expect(saved.createdByUserId).toBe(previousOwnerId);
      }
      const denied = await page.request.patch(capabilityPath, { data: { canMoveTasksToDone: true } });
      expect([403, 404]).toContain(denied.status());
      const events = await prisma.authAuditEvent.findMany({
        where: { credentialId: credential.id, action: "credential_capabilities_updated" },
        orderBy: { createdAt: "asc" },
      });
      expect(events.map((event) => event.actorUserId)).toEqual([newOwnerId, newOwnerId]);
      expect(events.map((event) => event.metadata)).toEqual([
        { canMoveTasksToDone: true }, { canMoveTasksToDone: false },
      ]);
    } finally {
      await otherContext.close();
      await prisma.project.delete({ where: { id: project.id } });
    }
  });
}
