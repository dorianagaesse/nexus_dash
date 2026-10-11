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
    await expect(page.getByText("Draft restored from this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.locator("#context-edit-title")).toHaveValue("Recovered context card");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "Add card" }).click();
    await page.locator("#context-create-title").fill("Context draft to discard");
    await page.getByRole("button", { name: "Close New context card" }).click();
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.getByText("Draft restored from this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Discard", exact: true }).click();
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
    await expect(page.getByText("Draft restored from this browser.")).toHaveCount(0);
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.locator("#task-title")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toHaveValue("");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});

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
