import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}

test("identifies event calendars with text and color across responsive themes", async ({
  page,
}) => {
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("nd365-calendar-source");
  await createProjectFromProjectsPage(page, projectName);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  await page.route("**/api/calendar/events?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        range: "current-week",
        timeMin: monday.toISOString(),
        timeMax: new Date(monday.getTime() + 7 * 86_400_000).toISOString(),
        syncedAt: new Date().toISOString(),
        writeSourceId: "source-personal",
        warnings: [],
        truncated: false,
        sources: [
          {
            id: "source-personal",
            connectionId: "connection-personal",
            name: "Personal",
            color: "#4285f4",
            accountLabel: "Dorian personal",
            accountEmail: "dorian@example.com",
            writable: true,
          },
          {
            id: "source-team",
            connectionId: "connection-team",
            name: "Team planning",
            color: null,
            accountLabel: "Work account",
            accountEmail: "dorian@company.example",
            writable: false,
          },
        ],
        events: [
          {
            id: "event-personal",
            summary: "Personal planning",
            start: toDateKey(today),
            end: toDateKey(tomorrow),
            isAllDay: true,
            location: null,
            description: "Personal focus",
            htmlLink: "https://calendar.google.com/calendar/event?eid=personal",
            status: "confirmed",
            calendarSourceId: "source-personal",
            connectionId: "connection-personal",
            calendarName: "Personal",
            calendarColor: "#4285f4",
            accountLabel: "Dorian personal",
            accountEmail: "dorian@example.com",
            writable: true,
          },
          {
            id: "event-team",
            summary: "Team review",
            start: toDateKey(today),
            end: toDateKey(tomorrow),
            isAllDay: true,
            location: null,
            description: "Read-only team event",
            htmlLink: "https://calendar.google.com/calendar/event?eid=team",
            status: "confirmed",
            calendarSourceId: "source-team",
            connectionId: "connection-team",
            calendarName: "Team planning",
            calendarColor: null,
            accountLabel: "Work account",
            accountEmail: "dorian@company.example",
            writable: false,
          },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await openNewestProjectDashboard(page, projectName);
  await page.getByRole("button", { name: "Calendar" }).click();

  const legend = page.getByLabel("Visible calendar sources");
  await expect(legend).toContainText("Personal");
  await expect(legend).toContainText("Dorian personal");
  await expect(legend).toContainText("Team planning");
  await expect(legend).toContainText("Work account");

  await page
    .locator("article")
    .filter({ hasText: "Team review", visible: true })
    .click();
  const readOnlyDialog = page.getByRole("dialog");
  await expect(readOnlyDialog.getByRole("heading", { name: "Calendar event" })).toBeVisible();
  await expect(readOnlyDialog.getByLabel("Event calendar source")).toContainText(
    "Team planning"
  );
  await expect(readOnlyDialog.getByLabel("Event calendar source")).toContainText(
    "Work account (dorian@company.example)"
  );
  await expect(readOnlyDialog.getByText("This calendar is read only in NexusDash.")).toBeVisible();
  await expect(readOnlyDialog.getByRole("link", { name: "Open in Google Calendar" })).toBeVisible();
  await readOnlyDialog.getByRole("button", { name: "Close", exact: true }).click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    localStorage.setItem("nexusdash-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .locator("article")
    .filter({ hasText: "Personal planning", visible: true })
    .click();
  const editableDialog = page.getByRole("dialog");
  await expect(
    editableDialog.getByRole("heading", { name: "Edit calendar event" })
  ).toBeVisible();
  await expect(editableDialog.getByLabel("Event calendar source")).toContainText(
    "Personal"
  );
  await expect(editableDialog.getByLabel("Event calendar source")).toContainText(
    "Dorian personal (dorian@example.com)"
  );
});
