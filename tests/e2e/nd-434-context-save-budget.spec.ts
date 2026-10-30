import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { CONTEXT_CARD_COLORS } from "../../lib/context-card-colors";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("context draft traffic stays idle until explicit multi-editor saves", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const ownerId = await signInAsVerifiedUser(page);
  const otherContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
  });
  const other = await otherContext.newPage();
  const editorId = await signInAsVerifiedUser(other);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd434-budget"), ownerId,
      memberships: { create: [{ userId: ownerId, role: "owner" }, { userId: editorId, role: "editor" }] },
    },
  });
  const card = await prisma.resource.create({
    data: { projectId: project.id, type: "context-card", name: "Budget fixture", content: "<p>Unchanged content</p>", color: CONTEXT_CARD_COLORS[0] },
  });
  const endpoint = `/api/projects/${project.id}/context-cards/${card.id}`;
  const patches: number[] = [];
  for (const client of [page, other]) {
    client.setDefaultTimeout(15_000);
    client.setDefaultNavigationTimeout(30_000);
    client.on("response", (response) => {
      if (new URL(response.url()).pathname === endpoint && response.request().method() === "PATCH") {
        patches.push(response.status());
      }
    });
  }
  async function openEditor(client: Page, title = "Budget fixture") {
    await client.goto(`/projects/${project.id}`);
    const toggle = client.getByRole("button", { name: "Project context" });
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
    await client.locator("article").filter({ hasText: title }).click();
    await client.getByRole("dialog").getByRole("button", { name: "Context card options" }).click();
    await client.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(client.locator("#context-edit-title")).toBeVisible();
  }
  const notificationCount = () => prisma.notification.count({ where: { recipientUserId: { in: [ownerId, editorId] } } });
  const emailCount = () => prisma.projectNotificationEmail.count({ where: { projectId: project.id } });
  try {
    await Promise.all([openEditor(page), openEditor(other)]);
    const before = { notifications: await notificationCount(), emails: await emailCount() };
    // Exceed both the 2-second quiet period and 30-second maximum wait.
    await page.waitForTimeout(31_000);
    expect(patches).toEqual([]);
    const idleRevision = (await prisma.resource.findUniqueOrThrow({ where: { id: card.id } })).contentRevision;
    expect(idleRevision).toBe(card.contentRevision);
    const activeStarted = Date.now();
    for (let index = 0; index < 60; index += 1) {
      await Promise.all([
        page.locator("#context-edit-title").fill(`Owner draft ${index}`),
        other.locator("#context-edit-title").fill(`Editor draft ${index}`),
      ]);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2_100);
    const activeSeconds = (Date.now() - activeStarted) / 1000;
    expect(patches).toEqual([]);
    const activeRevision = (await prisma.resource.findUniqueOrThrow({ where: { id: card.id } })).contentRevision;
    expect(activeRevision).toBe(card.contentRevision);
    expect(await notificationCount()).toBe(before.notifications);
    expect(await emailCount()).toBe(before.emails);

    await page.getByRole("button", { name: "Save card", exact: true }).click();
    await expect(page.locator("#context-edit-title")).toHaveCount(0);
    // Restoration after a remote save must retain the original revision.
    await other.getByRole("button", {name:"Close Edit context card",exact:true}).click();
    await openEditor(other,"Owner draft 59");
    await expect(other.locator("#context-edit-title")).toHaveValue("Editor draft 59");
    await expect(other.getByText(/Draft restored|Keep my|Use latest/i)).toHaveCount(0);
    await other.getByRole("button", { name: "Save card", exact: true }).click();
    await expect(other.getByText("This context card changed elsewhere. Please cancel and reopen it before trying again.")).toBeVisible();
    await expect(other.locator("[data-conflict-review]")).toHaveCount(0);
    await expect(other.getByRole("button", {name:/keep my|use latest|apply and save/i})).toHaveCount(0);
    await other.getByRole("button", {name:"Cancel",exact:true}).click();
    await openEditor(other,"Owner draft 59");
    await other.locator("#context-edit-title").fill("Editor draft 59");
    await other.getByRole("button", {name:"Save card",exact:true}).click();
    await expect(other.locator("#context-edit-title")).toHaveCount(0);
    expect(patches).toEqual([200, 412, 200]);
    let current = await prisma.resource.findUniqueOrThrow({ where: { id: card.id } });
    expect(current.contentRevision).toBe(card.contentRevision + 2);
    expect(current.name).toBe("Editor draft 59");
    expect(current.content).toBe(card.content);

    const wallMs: number[] = [];
    const serverMs: number[] = [];
    for (let index = 0; index < 22; index += 1) {
      const start = performance.now();
      const response = await page.request.patch(endpoint, {
        headers: { "X-Content-If-Match": `"context-card:${card.id}:${current.contentRevision}"`, "NexusDash-Mutation-Intent": "explicit" },
        data: { title: `Measured title ${index}` },
      });
      expect(response.status()).toBe(200);
      const wall = performance.now() - start;
      const server = Number(/dur=([\d.]+)/.exec(response.headers()["server-timing"] ?? "")?.[1]);
      if (index >= 2) { wallMs.push(wall); serverMs.push(server); }
      const body = await response.json();
      current = { ...current, contentRevision: body.card.contentRevision };
    }
    expect(await notificationCount()).toBe(before.notifications);
    expect(await emailCount()).toBe(before.emails);
    const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
    const result = {
      baseURL: testInfo.project.use.baseURL,
      clients: 2, idleSeconds: 31, idleWrites: 0,
      activeSeconds,
      activeDraftChanges: 120, timedWrites: 0,
      multiEditorStatuses: patches, multiEditorAcceptedWrites: 2,
      notificationDelta: (await notificationCount()) - before.notifications,
      emailDelta: (await emailCount()) - before.emails,
      samples: wallMs.length, warmups: 2,
      wallP50Ms: percentile(wallMs, 0.5), wallP95Ms: percentile(wallMs, 0.95),
      serverP50Ms: percentile(serverMs, 0.5), serverP95Ms: percentile(serverMs, 0.95),
    };
    console.log(`ND434_BUDGET ${JSON.stringify(result)}`);
    await testInfo.attach("context-save-budget.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  } finally {
    await otherContext.close();
    await prisma.project.delete({ where: { id: project.id } });
  }
});
