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
  await page
    .getByRole("button", { name: "Share project", exact: true })
    .click();
  await page.getByRole("button", { name: "Agent access", exact: true }).click();
  return page.getByRole("region", { name: "Agent access", exact: true });
}
test.afterEach(async ({ page }) => {
  if (projectId) {
    expect(
      (await page.request.delete(`/api/projects/${projectId}`)).ok()
    ).toBeTruthy();
    projectId = null;
  }
  if (ownerId) {
    await prisma.user.delete({ where: { id: ownerId } });
    ownerId = null;
  }
});

test("ND-655: readable directory, focused management flows, and independent completion permissions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const path = await createWorkspace(page);
  for (const [label, scopes] of [
    ["Release observer", ["project:read", "task:read"]],
    ["Expired worker", ["task:write"]],
    ["Revoked worker", ["task:write"]],
  ] as const) {
    const response = await page.request.post(path, { data: { label, scopes } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { credential } = await response.json();
    if (label.startsWith("Expired"))
      await prisma.apiCredential.update({
        where: { id: credential.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    if (label.startsWith("Revoked"))
      expect(
        (await page.request.delete(`${path}/${credential.id}`)).ok()
      ).toBeTruthy();
  }
  const panel = await openAgentAccess(page);
  const list = panel.getByRole("list", { name: "Agent credentials" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(page.locator("#project-agent-label")).toHaveCount(0);
  await expect(panel.locator("pre")).toHaveCount(0);
  await expect(list.getByText("Read only", { exact: true })).toBeVisible();
  await expect(
    list.getByRole("switch", {
      name: "Allow Release observer to move tasks to Done",
      exact: true,
    })
  ).toBeDisabled();
  const search = panel.getByRole("searchbox", { name: "Search credentials" });
  await search.fill("   ");
  await expect(
    panel.getByRole("button", { name: "Clear filters" })
  ).toHaveCount(0);
  await search.fill(" WORKER ");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await panel.getByRole("button", { name: "Filters", exact: true }).click();
  await panel.getByLabel("Status", { exact: true }).selectOption("expired");
  await panel
    .getByLabel("Capability", { exact: true })
    .selectOption("task:write");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(
    list.getByRole("switch", {
      name: "Allow Expired worker to move tasks to Done",
      exact: true,
    })
  ).toBeDisabled();
  await panel
    .getByLabel("Capability", { exact: true })
    .selectOption("task:read");
  await expect(
    panel.getByText("No matching agents", { exact: true })
  ).toBeVisible();
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await panel.getByRole("button", { name: "Filters", exact: true }).click();

  await panel
    .getByRole("button", { name: "New credential", exact: true })
    .click();
  const creation = page.getByRole("dialog", {
    name: "New agent credential",
    exact: true,
  });
  const nameInput = creation.getByLabel("Agent name", { exact: true });
  await expect(nameInput).toBeFocused();
  await page.screenshot({ path: ".tmp/nd655-create.png" });
  const longName = `Release ${"x".repeat(72)}`;
  await nameInput.fill(longName);
  await creation
    .getByLabel("Credential expiry", { exact: true })
    .selectOption("30");
  await creation
    .getByRole("button", { name: "Create credential", exact: true })
    .click();
  const key = page.getByRole("textbox", {
    name: `API key for ${longName}`,
    exact: true,
  });
  await expect(key).toBeVisible();
  await expect(key).toBeFocused();
  await expect(creation).toHaveCount(0);
  const originalKey = await key.inputValue();
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
  const created = list.getByRole("listitem", { name: longName, exact: true });
  await expect(created).toContainText("Read & write");
  const current = await (await page.request.get(path)).json();
  const credentialId = current.credentials.find(
    (credential: { label: string }) => credential.label === longName
  ).id;
  const capabilityPath = `${path}/${credentialId}`;

  const manage = created.getByRole("button", {
    name: `Manage ${longName}`,
    exact: true,
  });
  await manage.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", { name: longName, exact: true });
  await expect(details.getByText("Public id", { exact: true })).toBeVisible();
  await expect(
    details.getByText("Last rotated", { exact: true })
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await details
    .getByRole("button", { name: `Rotate key for ${longName}`, exact: true })
    .click();
  await expect(key).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await details
    .getByRole("button", { name: `Rotate key for ${longName}`, exact: true })
    .click();
  await expect(key).toBeVisible();
  expect(await key.inputValue()).not.toBe(originalKey);
  expect(
    (
      await page.request.post("/api/auth/agent/token", {
        data: { apiKey: originalKey },
      })
    ).ok()
  ).toBeFalsy();
  // ND-657: re-exchange across the existing second-precision rotation boundary.
  let accessToken = "";
  const rotatedKey = await key.inputValue();
  await expect
    .poll(async () => {
      const exchange = await page.request.post("/api/auth/agent/token", {
        data: { apiKey: rotatedKey },
      });
      expect(exchange.ok()).toBeTruthy();
      accessToken = (await exchange.json()).accessToken;
      return (
        await page.request.get(`/api/projects/${projectId}/tasks`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      ).ok();
    })
    .toBe(true);
  const headers = { Authorization: `Bearer ${accessToken}` };
  expect(
    (
      await page.request.patch(capabilityPath, {
        headers,
        data: { canMoveTasksToDone: true },
      })
    ).status()
  ).toBe(401);
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
  const completion = created.getByRole("switch", {
    name: `Allow ${longName} to move tasks to Done`,
    exact: true,
  });
  await expect(completion).not.toBeChecked();
  await completion.click();
  await expect(completion).toBeChecked();
  await expect(
    page.getByText("Agent capabilities saved.", { exact: true })
  ).toBeVisible();
  const saved = await (await page.request.get(path)).json();
  expect(
    saved.credentials.find((entry: { id: string }) => entry.id === credentialId)
      .canMoveTasksToDone
  ).toBe(true);
  expect(
    saved.credentials.find(
      (entry: { label: string }) => entry.label === "Release observer"
    ).canMoveTasksToDone
  ).toBe(false);
  expect(saved).not.toHaveProperty("agentCanMoveTasksToDone");
  await panel.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    panel.getByText("Credential capabilities updated", { exact: true })
  ).toBeVisible();
  await panel.getByRole("button", { name: "Credentials", exact: true }).click();

  for (const label of ["Planning assistant", "Documentation reviewer"]) {
    const issued = await page.request.post(path, {
      data: { label, scopes: ["project:read", "task:read", "task:write"] },
    });
    expect(issued.ok()).toBeTruthy();
  }
  await panel.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(6);
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".tmp/nd655-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
  const mobileName = await created
    .getByRole("heading", { name: longName, exact: true })
    .boundingBox();
  const mobilePanel = await panel.boundingBox();
  expect(mobileName!.width).toBeGreaterThan(mobilePanel!.width / 2);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".tmp/nd655-mobile.png" });

  await panel.getByRole("button", { name: "Setup guide", exact: true }).click();
  const setup = page.getByRole("dialog", {
    name: "Connect an agent",
    exact: true,
  });
  await expect(
    setup.getByText("Save the API key", { exact: true })
  ).toBeVisible();
  await setup.locator("summary").click();
  await expect(setup.locator("pre")).toContainText("NEXUSDASH_PROJECT_ID");
  expect(
    await setup.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
  await setup
    .getByRole("button", { name: "Close setup guide", exact: true })
    .click();
  await created
    .getByRole("button", { name: `Manage ${longName}`, exact: true })
    .click();
  await details
    .getByRole("button", { name: `Revoke ${longName}`, exact: true })
    .click();
  const revoke = page.getByRole("dialog", {
    name: `Revoke ${longName}?`,
    exact: true,
  });
  await revoke
    .getByRole("button", { name: "Revoke credential", exact: true })
    .click();
  await expect(created.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(completion).toBeDisabled();
  expect(
    (
      await page.request.get(`/api/projects/${projectId}/tasks`, { headers })
    ).ok()
  ).toBeFalsy();
});

test("ND-655: load recovery and action-specific errors stay in their focused flow", async ({
  page,
}) => {
  const path = await createWorkspace(page);
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await readGate;
    await route.fulfill({
      status: 503,
      json: { error: "agent-access-load-failed" },
    });
  });
  const panel = await openAgentAccess(page);
  await expect(
    panel.getByText("Loading credentials...", { exact: true })
  ).toBeVisible();
  releaseRead();
  await expect(
    page.getByRole("alert", { name: "Credential loading error" })
  ).toContainText("Could not load");
  await expect(
    panel.getByRole("button", { name: "New credential", exact: true })
  ).toBeDisabled();
  await page.unroute(`**${path}`);
  await page
    .getByRole("button", { name: "Retry loading credentials", exact: true })
    .click();
  await expect(
    panel.getByText("Invite your first agent", { exact: true })
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "New credential", exact: true })
    .click();
  const creation = page.getByRole("dialog", {
    name: "New agent credential",
    exact: true,
  });
  await creation.getByLabel("Agent name", { exact: true }).fill("Retry worker");
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 503,
      json: { error: "credential-create-failed" },
    });
  });
  await creation
    .getByRole("button", { name: "Create credential", exact: true })
    .click();
  await expect(
    creation.getByRole("alert", { name: "Credential creation error" })
  ).toContainText("Could not create");
  await expect(
    page.getByRole("button", { name: "Retry loading credentials" })
  ).toHaveCount(0);
  await expect(creation.getByLabel("Agent name", { exact: true })).toHaveValue(
    "Retry worker"
  );
  await page.unroute(`**${path}`);
  await creation
    .getByRole("button", { name: "Create credential", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "API key for Retry worker", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
  const summary = await (await page.request.get(path)).json();
  const credential = summary.credentials.find(
    (entry: { label: string }) => entry.label === "Retry worker"
  );
  const capabilitiesError = page.getByRole("alert", {
    name: "Agent capabilities error",
  });
  const completion = panel.getByRole("switch", {
    name: "Allow Retry worker to move tasks to Done",
    exact: true,
  });
  const capabilityPath = `${path}/${credential.id}`;
  await page.route(`**${capabilityPath}`, (route) =>
    route.fulfill({ status: 503, json: { error: "capability-save-failed" } })
  );
  await completion.click();
  await expect(capabilitiesError).toContainText(
    "Could not save agent capabilities"
  );
  await expect(completion).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Retry loading credentials" })
  ).toHaveCount(0);
  await page.unroute(`**${capabilityPath}`);
  await completion.click();
  await expect(completion).toBeChecked();
  await expect(capabilitiesError).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Manage Retry worker", exact: true })
    .click();
  const details = page.getByRole("dialog", {
    name: "Retry worker",
    exact: true,
  });
  const rotationRoute = `**${path}/*/rotate`;
  await page.route(rotationRoute, (route) =>
    route.fulfill({ status: 503, json: { error: "credential-rotate-failed" } })
  );
  page.once("dialog", (dialog) => dialog.accept());
  await details
    .getByRole("button", { name: "Rotate key for Retry worker", exact: true })
    .click();
  await expect(
    details.getByRole("alert", { name: "Credential rotation error" })
  ).toContainText("Could not rotate the API key");
  await expect(
    page.getByRole("button", { name: "Retry loading credentials" })
  ).toHaveCount(0);
  await page.unroute(rotationRoute);
  page.once("dialog", (dialog) => dialog.accept());
  await details
    .getByRole("button", { name: "Rotate key for Retry worker", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "API key for Retry worker", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide key", exact: true }).click();
});
