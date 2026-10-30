import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("create forms recover after close and reload without creating records", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd434-recovery"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH"].includes(request.method()) && request.url().includes(`/api/projects/${project.id}/`)) {
      mutations.push(request.url());
    }
  });

  try {
    await page.goto(`/projects/${project.id}`);

    await page.getByRole("button", { name: "New task" }).click();
    await page.locator("#task-title").fill("Recovered task creation");
    await page.getByRole("button", { name: "Close task creation" }).click();
    await page.reload();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveValue("Recovered task creation");
    await page.getByRole("button", { name: "Close task creation" }).click();

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill("Recovered context card");
    await page.getByRole("button", { name: "Close New context card" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.locator("#context-create-title")).toHaveValue("Recovered context card");
    await page.getByRole("button", { name: "Close New context card" }).click();

    await page.getByRole("button", { name: "New event" }).click();
    await page.locator("#roadmap-entity-title").fill("Recovered roadmap event");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await page.getByRole("button", { name: "New event" }).click();
    await expect(page.locator("#roadmap-entity-title")).toHaveValue("Recovered roadmap event");
    await page.getByRole("button", { name: "Cancel" }).click();

    expect(mutations).toEqual([]);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.resource.count({ where: { projectId: project.id, type: "context-card" } })).toBe(0);

    let createCalls = 0;
    await page.route(`**/api/projects/${project.id}/tasks`, async (route) => {
      if (route.request().method() === "POST") {
        createCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveValue("Recovered task creation");
    const created = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith(`/api/projects/${project.id}/tasks`) && response.ok()
    );
    await page.getByRole("button", { name: "Create task" }).click();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveCount(0);
    await created;
    expect(createCalls).toBe(1);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);

    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.locator("#context-create-title")).toHaveValue("Recovered context card");
    const contextCreated = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith(`/api/projects/${project.id}/context-cards`) && response.ok()
    );
    await page.getByRole("button", { name: "Create card" }).click();
    await contextCreated;
    const contextCard = page.locator("article").filter({ hasText: "Recovered context card" }).first();
    await expect(contextCard).toBeVisible();
    await contextCard.click();
    await page.getByRole("button", { name: "Context card options" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("#context-edit-title").fill("Recovered context edit");
    await page.getByRole("button", { name: "Close Edit context card" }).click();
    expect((await prisma.resource.findFirstOrThrow({ where: { projectId: project.id, type: "context-card" } })).name).toBe("Recovered context card");
    await page.reload();
    await contextCard.click();
    await page.getByRole("button", { name: "Context card options" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator("#context-edit-title")).toHaveValue("Recovered context edit");
    await expect(page.getByText("Draft restored.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Discard", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await contextCard.click();
    await page.getByRole("button", { name: "Context card options" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator("#context-edit-title")).toHaveValue("Recovered context card");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill("Context draft to discard");
    await page.getByRole("button", { name: "Close New context card" }).click();
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.getByText("Draft restored.")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.locator("#context-create-title")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.locator("#context-create-title")).toHaveValue("");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "New task" }).click();
    await page.locator("#task-title").fill("Task draft to discard");
    await page.getByRole("button", { name: "Close task creation" }).click();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.getByText("Draft restored.")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveValue("");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});

for (const legacyDraft of [false, true]) {
test(`calendar ${legacyDraft ? "legacy" : "current"} edit draft preconditions refuse to overwrite a newer event`, async ({ page }, testInfo) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd434-calendar-edit"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });

  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const weekStart = new Date(start);
  weekStart.setHours(0, 0, 0, 0);

  let eventVersion = 1;
  let patchMode: "accept" | "conflict" = "accept";
  let getCount = 0;
  const patchBodies: Array<Record<string, unknown>> = [];

  const buildEvent = () => ({
    id: "evt-stale",
    etag: `"etag-${eventVersion}"`,
    summary: eventVersion === 1 ? "Planning v1" : "Planning v2",
    start: start.toISOString(),
    end: end.toISOString(),
    isAllDay: false,
    location: null,
    description: null,
    htmlLink: null,
    status: "confirmed",
    calendarSourceId: "source-1",
    connectionId: "connection-1",
    calendarName: "Personal",
    calendarColor: null,
    accountLabel: "Personal",
    accountEmail: null,
    writable: true,
  });

  await page.route("**/api/calendar/events?**", async (route) => {
    getCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        writable: true,
        range: "current-week",
        timeMin: weekStart.toISOString(),
        timeMax: new Date(weekStart.getTime() + 7 * 86_400_000).toISOString(),
        events: [buildEvent()],
        sources: [
          {
            id: "source-1",
            connectionId: "connection-1",
            name: "Personal",
            color: null,
            accountLabel: "Personal",
            accountEmail: null,
            writable: true,
          },
        ],
        writeSourceId: "source-1",
      }),
    });
  });
  await page.route("**/api/calendar/events/evt-stale", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    patchBodies.push(
      JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>
    );
    if (patchMode === "conflict") {
      await route.fulfill({
        status: 412,
        contentType: "application/json",
        body: JSON.stringify({ error: "calendar-edit-conflict" }),
      });
      return;
    }
    eventVersion = 3;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ event: buildEvent() }),
    });
  });

  try {
    const calendarToggle = page.getByRole("button", { name: "My calendar" });
    // Pin the persisted expansion before reloading so the panel state is
    // restored deterministically instead of racing hydration.
    const reloadWithCalendarExpanded = async () => {
      await page.evaluate((projectId) => {
        localStorage.setItem(
          `nexusdash:project:${projectId}:calendar-expanded`,
          "1"
        );
      }, project.id);
      await page.reload();
      // A restored section preference may be reconciled during hydration.
      // Open the panel through its ordinary control if it is still collapsed.
      if (await calendarToggle.getAttribute("aria-expanded") === "false") {
        await calendarToggle.click();
      }
      await expect(calendarToggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    };

    await page.goto(`/projects/${project.id}`);
    await reloadWithCalendarExpanded();

    await page.locator("article").filter({ hasText: "Planning v1", visible: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit calendar event" })
    ).toBeVisible();
    await page.locator("#calendar-event-summary").fill("My planning edit");
    await dialog.getByRole("button", { name: "Close calendar event", exact: true }).click();

    if (legacyDraft) {
      // Seed the exact version-1 envelope shape written before ETags existed.
      await page.evaluate(({ userId, projectId }) => {
        const key = `nexusdash.draft.v1:${userId}:${projectId}:calendar-event:edit:source-1:evt-stale`;
        const envelope = JSON.parse(localStorage.getItem(key)!);
        delete envelope.payload.etag;
        const base = JSON.parse(envelope.base);
        delete base.etag;
        envelope.base = JSON.stringify(base);
        localStorage.setItem(key, JSON.stringify(envelope));
      }, { userId, projectId: project.id });
    }

    // The event changes in Google after the draft was stored.
    eventVersion = 2;
    await reloadWithCalendarExpanded();
    await page.locator("article").filter({ hasText: "Planning v2", visible: true }).click();

    const reopened = page.getByRole("dialog");
    await expect(page.locator("#calendar-event-summary")).toHaveValue("My planning edit");
    await expect(reopened.getByText(/Draft restored|Another version of this draft|keep my changes|Discard draft/i)).toHaveCount(0);
    await expect(reopened.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
    if (legacyDraft) {
      await page.screenshot({ path: testInfo.outputPath("calendar-silent-recovery-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: testInfo.outputPath("calendar-silent-recovery-mobile.png") });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    // A stale or unknown revision fails as an ordinary save error, without choices.
    patchMode = "conflict";
    await reopened.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(reopened.getByText(/Could not save this event/)).toBeVisible();
    await expect(page.locator("#calendar-event-summary")).toHaveValue("My planning edit");
    expect(patchBodies).toHaveLength(legacyDraft ? 0 : 1);
    if (!legacyDraft) expect(patchBodies[0].expectedEtag).toBe('"etag-1"');
    expect(eventVersion).toBe(2);
    await reopened.getByRole("button", { name: "Close calendar event" }).click();
    await reloadWithCalendarExpanded();
    await page.locator("article").filter({ hasText: "Planning v2", visible: true }).click();
    await expect(page.locator("#calendar-event-summary")).toHaveValue("My planning edit");
    await expect(page.getByText(/Draft restored|keep my changes|Discard draft/i)).toHaveCount(0);

    // Explicit Cancel abandons the edit through the ordinary form action.
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator("article").filter({ hasText: "Planning v2", visible: true }).click();
    await expect(page.locator("#calendar-event-summary")).toHaveValue("Planning v2");
    await page.locator("#calendar-event-summary").fill("Fresh event edit");
    patchMode = "accept";
    await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(patchBodies.at(-1)).toMatchObject({ summary: "Fresh event edit", expectedEtag: '"etag-2"' });
    expect(eventVersion).toBe(3);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
}

test("calendar create draft recovers without a Google write", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd434-calendar"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  let writes = 0;
  await page.route("**/api/calendar/events?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      connected: true,
      writable: true,
      events: [],
      timeMin: new Date().toISOString(),
      sources: [{ id: "source-1", connectionId: "connection-1", name: "Personal", color: null, accountLabel: "Personal", accountEmail: null, writable: true }],
      writeSourceId: "source-1",
    }),
  }));
  page.on("request", (request) => {
    if (request.url().includes("/api/calendar/events") && request.method() !== "GET") writes += 1;
  });

  try {
    await page.goto(`/projects/${project.id}`);
    const calendarToggle = page.getByRole("button", { name: "My calendar" });
    await expect(calendarToggle).toHaveAttribute("aria-expanded", "false");
    await calendarToggle.click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New event" })).toHaveCount(2);
    await page.getByRole("button", { name: "New event" }).last().click();
    await page.locator("#calendar-event-summary").fill("Recovered calendar event");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("nexusdash.draft.v1:")).length
        )
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("Draft saved locally in this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Close calendar event" }).click();
    await page.evaluate((projectId) => {
      localStorage.setItem(`nexusdash:project:${projectId}:calendar-expanded`, "0");
    }, project.id);
    await page.reload();
    await expect(calendarToggle).toHaveAttribute("aria-expanded", "false");
    await calendarToggle.click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New event" })).toHaveCount(2);
    await page.getByRole("button", { name: "New event" }).last().click();
    await expect(page.locator("#calendar-event-summary")).toHaveValue("Recovered calendar event");
    expect(writes).toBe(0);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
