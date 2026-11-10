import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("a viewer's open comment thread follows current agent labels without reloading", async ({ page, browser, playwright }) => {
  test.setTimeout(90000);
  const ownerId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("current-agent-author"), ownerId,
    memberships: { create: { userId: ownerId, role: "owner" } },
  } });
  const prefix = `/api/projects/${project.id}`;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  const readerContext = await browser.newContext({ baseURL });
  const reader = await readerContext.newPage();
  const viewerId = await signInAsVerifiedUser(reader);
  await prisma.projectMembership.create({ data: { projectId: project.id, userId: viewerId, role: "viewer" } });
  const agent = await playwright.request.newContext({ baseURL });
  try {
    const created = await page.request.post(`${prefix}/agent-access`, { data: {
      label: "Current author", descriptiveLabels: ["Original"], scopes: ["task:read", "task:write"],
    } });
    expect(created.status()).toBe(201);
    const { credential, apiKey } = await created.json();
    const exchanged = await agent.post("/api/auth/agent/token", { headers: { Authorization: `ApiKey ${apiKey}` } });
    expect(exchanged.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await exchanged.json()).accessToken}` };
    const taskResponse = await page.request.post(`${prefix}/tasks`, { data: { title: "Live author metadata", status: "Backlog" } });
    const taskData = await taskResponse.json();
    const taskId = taskData.task?.id ?? taskData.id;
    const posted = await agent.post(`${prefix}/tasks/${taskId}/comments`, { headers, data: { content: "A comment posted before labels changed." } });
    expect(posted.status()).toBe(201);
    const originalComment = (await posted.json()).comment;
    await reader.goto(`${baseURL}/projects/${project.id}?taskId=${taskId}`);
    const comment = reader.locator("article").filter({ hasText: "A comment posted before labels changed." });
    await expect(comment.getByText("Original", { exact: true })).toBeVisible();
    // Readers can resolve public authors while credential administration stays owner-only.
    expect((await reader.request.get(`${prefix}/agent-access`)).status()).toBe(403);

    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Share project", exact: true }).click();
    await page.getByRole("button", { name: "Agent access", exact: true }).click();
    await page.getByRole("button", { name: "Manage Current author", exact: true }).click();
    await page.getByRole("button", { name: "Edit descriptive labels for Current author", exact: true }).click();
    await page.getByRole("button", { name: "Remove label Original", exact: true }).click();
    const input = page.getByLabel("Descriptive labels for Current author", { exact: true });
    await input.fill("Current"); await input.press("Enter");
    await input.fill("Codex"); await input.press("Enter");
    await page.getByRole("button", { name: "Save labels", exact: true }).click();
    await expect(comment.getByText("Original", { exact: true })).toHaveCount(0);
    await expect(comment.getByText("Current", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(comment.getByText("Codex", { exact: true })).toBeVisible();
    await reader.screenshot({ path: test.info().outputPath("current-author-labels.png"), animations: "disabled" });

    const cleared = await page.request.patch(`${prefix}/agent-access/${credential.id}/labels`, { data: { descriptiveLabels: [] } });
    expect(cleared.status()).toBe(200);
    await expect(comment.getByRole("group", { name: "Descriptive labels", exact: true })).toHaveCount(0, { timeout: 20000 });
    await prisma.apiCredential.update({ where: { id: credential.id }, data: { label: "Renamed author" } });
    await expect(comment.getByText("Renamed author", { exact: true })).toBeVisible({ timeout: 20000 });
    await prisma.apiCredential.delete({ where: { id: credential.id } });
    await reader.reload();
    await expect(comment.getByText("Renamed author", { exact: true })).toBeVisible();
    await expect(comment.getByRole("group", { name: "Descriptive labels", exact: true })).toHaveCount(0);
    const persisted = (await (await reader.request.get(`${prefix}/tasks/${taskId}/comments`)).json()).comments[0];
    expect(persisted.id).toBe(originalComment.id);
    expect(persisted.createdAt).toBe(originalComment.createdAt);
    expect(persisted.updatedAt).toBe(originalComment.updatedAt);
    expect(persisted.content).toBe(originalComment.content);
  } finally {
    await readerContext.close(); await agent.dispose();
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
  }
});
