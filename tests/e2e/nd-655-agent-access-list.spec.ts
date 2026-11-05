import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

let projectId: string | null = null;
let ownerId: string | null = null;

async function createWorkspace(page: Page) {
  ownerId = await signInAsVerifiedUser(page);
  const response = await page.request.post("/api/projects", {
    data: { name: uniqueProjectName("nd655-agent-access") },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  projectId = (await response.json()).project.id;
  await page.goto(`/projects/${projectId}`);
  return `/api/projects/${projectId}/agent-access`;
}

async function openAgentAccess(page: Page) {
  await page.getByRole("button", { name: "Share project", exact: true }).click();
  await page.getByRole("button", { name: "Agent access", exact: true }).click();
  return page.getByRole("region", { name: "Agent access", exact: true });
}

test.afterEach(async ({ page }) => {
  if (projectId) {
    expect((await page.request.delete(`/api/projects/${projectId}`)).ok()).toBeTruthy();
    projectId = null;
  }
  if (ownerId) {
    await prisma.user.delete({ where: { id: ownerId } });
    ownerId = null;
  }
});

test("ND-655: search and filters combine across credential statuses and capabilities", async ({ page }) => {
  const path = await createWorkspace(page);
  for (const [label, scopes] of [
    ["Release observer", ["project:read", "task:read"]],
    ["Expired worker", ["task:write"]],
    ["Revoked worker", ["task:write"]],
  ] as const) {
    const response = await page.request.post(path, { data: { label, scopes } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { credential } = await response.json();
    if (label.startsWith("Expired")) {
      await prisma.apiCredential.update({
        where: { id: credential.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    } else if (label.startsWith("Revoked")) {
      expect((await page.request.delete(`${path}/${credential.id}`)).ok()).toBeTruthy();
    }
  }
  const panel = await openAgentAccess(page);
  const list = panel.getByRole("list", { name: "Agent credentials" });
  await expect(list.getByRole("listitem")).toHaveCount(3);

  const search = panel.getByRole("searchbox", { name: "Search credentials" });
  const status = panel.getByLabel("Status", { exact: true });
  const capability = panel.getByLabel("Capability", { exact: true });
  await search.fill("  WORKER  ");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await status.selectOption("expired");
  await capability.selectOption("task:write");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("listitem", { name: "Expired worker", exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "Rotate key for Expired worker" })).toBeDisabled();
  await capability.selectOption("task:read");
  await expect(panel.getByText("No credentials match your search and filters.", { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(status).toHaveValue("all");
  await expect(capability).toHaveValue("all");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await status.selectOption("revoked");
  await expect(list.getByRole("button", { name: "Revoke Revoked worker", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Clear filters" }).click();

  await panel.getByRole("button", { name: "New credential" }).click();
  const nameInput = page.getByLabel("Credential label", { exact: true });
  await expect(nameInput).toBeFocused();
  const longName = `Release ${"x".repeat(72)}`;
  await nameInput.fill(longName);
  await page.getByLabel("Credential expiry", { exact: true }).selectOption("30");
  await page.getByRole("button", { name: "Create credential", exact: true }).click();
  const key = page.getByRole("textbox", { name: `API key for ${longName}`, exact: true });
  await expect(key).toBeVisible();
  await expect(key).toBeFocused();
  const originalKey = await key.inputValue();
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
  const created = list.getByRole("listitem", { name: longName, exact: true });
  await expect(created).toContainText("Task Write");
  await expect(created).not.toContainText("Expires: Never");

  // Keyboard users can inspect lifecycle metadata without leaving the list.
  const details = created.locator("summary");
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(created.getByText("Public id", { exact: true })).toBeVisible();
  await expect(created.getByText("Last rotated", { exact: true })).toBeVisible();

  // Rotation still requires confirmation and replaces the exchangeable key.
  page.once("dialog", (dialog) => dialog.dismiss());
  await created.getByRole("button", { name: `Rotate key for ${longName}`, exact: true }).click();
  await expect(key).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await created.getByRole("button", { name: `Rotate key for ${longName}`, exact: true }).click();
  await expect(key).toBeVisible();
  expect(await key.inputValue()).not.toBe(originalKey);
  const oldExchange = await page.request.post("/api/auth/agent/token", { data: { apiKey: originalKey } });
  expect(oldExchange.ok()).toBeFalsy();
  // ND-657: existing bearer timestamps have second precision; re-exchange across the
  // rotation boundary until the newly issued token can be used.
  let accessToken = "";
  const rotatedKey = await key.inputValue();
  await expect.poll(async () => {
    const exchange = await page.request.post("/api/auth/agent/token", { data: { apiKey: rotatedKey } });
    expect(exchange.ok()).toBeTruthy();
    accessToken = (await exchange.json()).accessToken;
    return (await page.request.get(`/api/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })).ok();
  }).toBe(true);
  const headers = { Authorization: `Bearer ${accessToken}` };
  expect((await page.request.patch(path, { headers, data: { agentCanMoveTasksToDone: true } })).status()).toBe(401);
  await page.getByRole("button", { name: "Hide key", exact: true }).click();

  const doneSwitch = page.getByRole("switch", { name: "Allow agents to move tasks to Done" });
  await doneSwitch.click();
  await expect(page.getByText("Agent capabilities saved.", { exact: true })).toBeVisible();
  await expect(doneSwitch).toBeChecked();
  expect((await (await page.request.get(path)).json()).agentCanMoveTasksToDone).toBe(true);

  await created.getByRole("button", { name: `Revoke ${longName}`, exact: true }).click();
  const revokeDialog = page.getByRole("dialog", { name: `Revoke ${longName}?`, exact: true });
  await expect(revokeDialog).toBeVisible();
  await revokeDialog.getByRole("button", { name: "Revoke credential", exact: true }).click();
  await expect(created.getByText("Revoked", { exact: true }).first()).toBeVisible();
  await expect(created.getByRole("button", { name: `Revoke ${longName}`, exact: true })).toBeDisabled();
  expect((await page.request.get(`/api/projects/${projectId}/tasks`, { headers })).ok()).toBeFalsy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".tmp/nd655-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.getByRole("dialog").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const mobileName = await created.getByRole("heading", { name: longName, exact: true }).boundingBox();
  const mobilePanel = await panel.boundingBox();
  expect(mobileName!.width).toBeGreaterThan(mobilePanel!.width / 2);
  await created.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".tmp/nd655-mobile.png" });
});

test("ND-655: loading, failed reads, empty lists and failed creation have usable feedback", async ({ page }) => {
  const path = await createWorkspace(page);
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await readGate;
    await route.fulfill({ status: 503, json: { error: "agent-access-load-failed" } });
  });
  const panel = await openAgentAccess(page);
  await expect(panel.getByText("Loading credentials...", { exact: true })).toBeVisible();
  releaseRead();
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await expect(page.getByRole("button", { name: "Create credential", exact: true })).toBeDisabled();
  await page.unroute(`**${path}`);
  await page.getByRole("button", { name: "Retry loading credentials", exact: true }).click();
  await expect(panel.getByText("No agent credentials exist for this project yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await panel.getByRole("button", { name: "New credential", exact: true }).click();
  await page.getByLabel("Credential label", { exact: true }).fill("Retry worker");
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 503, json: { error: "credential-create-failed" } });
  });
  await page.getByRole("button", { name: "Create credential", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("Could not create");
  await expect(page.getByLabel("Credential label", { exact: true })).toHaveValue("Retry worker");
  await page.unroute(`**${path}`);
  await page.getByRole("button", { name: "Create credential", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "API key for Retry worker", exact: true })).toBeVisible();
  await expect(panel.getByRole("listitem", { name: "Retry worker", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
});
