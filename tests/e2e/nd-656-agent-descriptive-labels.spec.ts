import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";
import { copyAndCloseAgentKey } from "./helpers/agent-access-helpers";

test("owners manage credential labels and comments preserve attribution across the credential lifecycle", async ({ page, playwright }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("nd656-labels"), ownerId: userId,
    memberships: { create: { userId, role: "owner" } },
  } });
  const prefix = `/api/projects/${project.id}`;
  const name = "ND656 release agent";
  let agent: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
  try {
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Share project" }).click();
    await page.getByRole("button", { name: "Agent access", exact: true }).click();
    await page.getByRole("button", { name: "New credential", exact: true }).click();
    await page.locator("#project-agent-label").fill(name);
    const createLabels = page.getByLabel("Descriptive labels (optional)", { exact: true });
    await createLabels.fill("x".repeat(41));
    await page.getByRole("button", { name: "Create credential", exact: true }).click();
    await expect(createLabels).toBeFocused();
    await expect(createLabels).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Descriptive labels (optional)", { exact: true }).fill(" GPT-6, Codex ");
    await page.getByRole("button", { name: "Create credential", exact: true }).click();
    const apiKey = await page.getByRole("textbox", { name: `API key for ${name}`, exact: true }).inputValue();
    await copyAndCloseAgentKey(page);
    const summary = await (await page.request.get(`${prefix}/agent-access`)).json();
    const credential = summary.credentials.find((entry: {label: string}) => entry.label === name);
    expect(credential.descriptiveLabels).toEqual(["GPT-6", "Codex"]);
    expect(JSON.stringify(summary)).not.toContain("secretHash");
    expect(JSON.stringify(summary)).not.toContain(apiKey);
    await expect(page.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("GPT-6");
    await expect(page.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("Codex");

    await page.getByLabel("Search credentials", { exact: true }).fill(" codex ");
    await expect(page.getByRole("listitem", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("Status", { exact: true }).selectOption("revoked");
    await expect(page.getByRole("listitem", { name, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.getByRole("listitem", { name, exact: true })).toBeVisible();

    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    agent = await playwright.request.newContext({ baseURL: new URL(page.url()).origin,
      extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : undefined });
    const exchange = await agent.post("/api/auth/agent/token", { headers: { Authorization: `ApiKey ${apiKey}` } });
    expect(exchange.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await exchange.json()).accessToken}` };
    expect((await agent.patch(`${prefix}/agent-access/${credential.id}/labels`, { headers, data: { descriptiveLabels: ["Forged"] } })).status()).toBe(401);
    const taskResponse = await agent.post(`${prefix}/tasks`, { headers, data: { title: "ND656 attribution", status: "Backlog" } });
    expect(taskResponse.status()).toBe(201);
    const taskData = await taskResponse.json();
    const taskId = taskData.task?.id ?? taskData.id;
    expect(taskId).toBeTruthy();
    const commentsUrl = `${prefix}/tasks/${taskId}/comments`;
    const post = await agent.post(commentsUrl, { headers, data: { content: "Original model attribution" } });
    expect(post.status()).toBe(201);
    const comment = (await post.json()).comment;
    expect(comment.author.agentCredentialDescriptiveLabels).toEqual(["GPT-6", "Codex"]);

    await page.getByRole("button", { name: `Manage ${name}`, exact: true }).click();
    const details = page.getByRole("dialog", { name, exact: true });
    await details.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true }).click();
    const editField = page.getByLabel(`Descriptive labels for ${name}`, { exact: true });
    await editField.fill("x".repeat(41));
    await page.getByRole("button", { name: "Save labels", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "40 characters" })).toBeVisible();
    await expect(editField).toBeFocused();
    await editField.fill("GPT-6.1, Research");
    const labelsRoute = `**${prefix}/agent-access/${credential.id}/labels`;
    await page.route(labelsRoute, (route) => route.fulfill({
      status: 503, json: { error: "credential-labels-update-failed" },
    }));
    await page.getByRole("button", { name: "Save labels", exact: true }).click();
    await expect(page.getByRole("alert", { name: "Credential labels error" })).toContainText("Could not save descriptive labels");
    await expect(page.getByRole("button", { name: "Retry loading credentials" })).toHaveCount(0);
    await expect(editField).toHaveValue("GPT-6.1, Research");
    await page.unroute(labelsRoute);
    let releaseSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
    await page.route(labelsRoute, async (route) => {
      await pendingSave;
      await route.continue();
    });
    try {
      await page.getByRole("button", { name: "Save labels", exact: true }).click();
      await expect(page.getByRole("button", { name: "Saving labels...", exact: true })).toBeDisabled();
      await expect(details.getByRole("button", { name: `Rotate key for ${name}`, exact: true })).toBeDisabled();
      await expect(details.getByRole("button", { name: "Close credential details", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(details).toBeVisible();
    } finally {
      releaseSave();
    }
    await expect(page.getByRole("alert", { name: "Credential labels error" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true })).toBeFocused();
    await page.unroute(labelsRoute);
    await page.reload();
    await page.getByRole("button", { name: "Share project" }).click();
    await page.getByRole("button", { name: "Agent access", exact: true }).click();
    await expect(page.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("GPT-6.1");
    await expect(page.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("Research");
    const edited = await agent.patch(`${commentsUrl}/${comment.id}`, { headers, data: { content: "Original model attribution, edited" } });
    expect(edited.status()).toBe(200);
    expect((await edited.json()).comment.author.agentCredentialDescriptiveLabels).toEqual(["GPT-6", "Codex"]);
    const next = await agent.post(commentsUrl, { headers, data: { content: "New model attribution" } });
    expect(next.status()).toBe(201);
    expect((await next.json()).comment.author.agentCredentialDescriptiveLabels).toEqual(["GPT-6.1", "Research"]);

    await page.getByRole("button", { name: `Manage ${name}`, exact: true }).click();
    await page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true }).click();
    await page.getByLabel(`Descriptive labels for ${name}`, { exact: true }).fill(
      Array.from({ length: 5 }, (_, index) => String(index).repeat(40)).join(", ")
    );
    await page.getByRole("button", { name: "Save labels", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true })).toBeVisible();
    const bounds = await details.getByRole("group", { name: "Descriptive labels", exact: true }).boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.screenshot({ path: test.info().outputPath("labels-mobile-dark.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({ path: test.info().outputPath("labels-desktop-light.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true }).click();
    await page.getByLabel(`Descriptive labels for ${name}`, { exact: true }).fill("");
    await page.getByRole("button", { name: "Save labels", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit descriptive labels for ${name}`, exact: true })).toBeFocused();
    await details.getByRole("button", { name: "Close credential details", exact: true }).click();
    const empty = await (await page.request.get(`${prefix}/agent-access`)).json();
    expect(empty.credentials.find((entry: {id: string}) => entry.id === credential.id).descriptiveLabels).toEqual([]);
    const assertHistory = async () => {
      const response = await page.request.get(commentsUrl);
      expect(response.ok()).toBeTruthy();
      const rows = (await response.json()).comments;
      expect(rows[0].author.displayName).toBe(`${name} (agent)`);
      expect(rows[0].author.agentCredentialDescriptiveLabels).toEqual(["GPT-6", "Codex"]);
      expect(rows[1].author.agentCredentialDescriptiveLabels).toEqual(["GPT-6.1", "Research"]);
    };
    // Rename is another owner-managed field; simulate it independently from labels.
    await prisma.apiCredential.update({ where: { id: credential.id }, data: { label: "Renamed agent" } });
    await assertHistory();
    const revoke = await page.request.delete(`${prefix}/agent-access/${credential.id}`);
    expect(revoke.status()).toBe(200);
    await assertHistory();
    await prisma.apiCredential.delete({ where: { id: credential.id } });
    await assertHistory();
    await page.goto(`/projects/${project.id}?taskId=${taskId}`);
    const original = page.locator("article").filter({ hasText: "Original model attribution, edited" });
    await expect(original.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("GPT-6");
    await expect(original.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("Codex");
    await expect(original).toContainText(`${name} (agent)`);
    await page.reload();
    await expect(original.getByRole("group", { name: "Descriptive labels", exact: true })).toContainText("Codex");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  } finally {
    await agent?.dispose();
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});


test("metadata writes enforce owner sessions, project boundaries and validation", async ({ page, playwright }) => {
  const ownerId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd656-access"), ownerId } });
  const other = await prisma.project.create({ data: { name: uniqueProjectName("nd656-other"), ownerId } });
  const prefix = `/api/projects/${project.id}/agent-access`;
  const owner = await playwright.request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? 3000}`,
    storageState: await page.context().storageState(),
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  });
  let editorId: string | undefined;
  try {
    const created = await owner.post(prefix, { data: { label: "Plain agent", scopes: ["task:read"] } });
    expect(created.status()).toBe(201);
    const credential = (await created.json()).credential;
    expect(credential.descriptiveLabels).toEqual([]);
    const url = `${prefix}/${credential.id}/labels`;
    for (const descriptiveLabels of [null, [""], ["x".repeat(41)], Array.from({ length: 6 }, (_, index) => `label-${index}`)]) {
      const invalid = await owner.patch(url, { data: { descriptiveLabels } });
      expect(invalid.status()).toBe(400);
      expect((await invalid.json()).error).toBe("invalid-descriptive-labels");
    }
    const deduplicated = await owner.patch(url, { data: { descriptiveLabels: ["GPT-6", "gpt-6", "A", "B", "C", "D"] } });
    expect(deduplicated.status()).toBe(200);
    expect((await deduplicated.json()).credential.descriptiveLabels).toEqual(["GPT-6", "A", "B", "C", "D"]);
    expect((await owner.patch(url, { data: { descriptiveLabels: [] } })).status()).toBe(200);
    const foreign = await owner.patch(`/api/projects/${other.id}/agent-access/${credential.id}/labels`, { data: { descriptiveLabels: ["Foreign"] } });
    expect(foreign.status()).toBe(404);
    editorId = await signInAsVerifiedUser(page);
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: editorId, role: "editor" } });
    expect((await page.request.patch(url, { data: { descriptiveLabels: ["Unauthorized"] } })).status()).toBe(403);
    expect((await page.request.get(prefix)).status()).toBe(403);
    const stored = await (await owner.get(prefix)).json();
    expect(stored.credentials[0].descriptiveLabels).toEqual([]);
  } finally {
    await owner.dispose();
    await prisma.project.deleteMany({ where: { id: { in: [project.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, ...(editorId ? [editorId] : [])] } } });
  }
});
