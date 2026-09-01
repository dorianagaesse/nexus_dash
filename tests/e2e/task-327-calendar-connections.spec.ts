import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

test("manages multiple Calendar sources accessibly across mobile and desktop themes", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const first = await prisma.calendarConnection.create({
    data: {
      userId,
      provider: "google",
      providerAccountId: "e2e-google-a",
      accountEmail: "calendar-a@example.com",
      accountLabel: "calendar-a@example.com",
      refreshToken: "e2e-refresh-a",
      reauthorizationRequiredAt: new Date(),
    },
  });
  const firstSources = await Promise.all([
    prisma.calendarSource.create({
      data: {
        userId,
        connectionId: first.id,
        providerCalendarId: "primary-a",
        name: "Personal",
        color: "#4285f4",
        accessRole: "owner",
        isPrimary: true,
        isSelected: true,
      },
    }),
    prisma.calendarSource.create({
      data: {
        userId,
        connectionId: first.id,
        providerCalendarId: "holidays-a",
        name: "Company holidays",
        accessRole: "reader",
        isSelected: true,
      },
    }),
  ]);
  const second = await prisma.calendarConnection.create({
    data: {
      userId,
      provider: "google",
      providerAccountId: "e2e-google-b",
      accountEmail: "calendar-b@example.com",
      accountLabel: "calendar-b@example.com",
      refreshToken: "e2e-refresh-b",
    },
  });
  await prisma.calendarSource.create({
    data: {
      userId,
      connectionId: second.id,
      providerCalendarId: "primary-b",
      name: "Team planning",
      accessRole: "writer",
      isPrimary: true,
      isSelected: false,
    },
  });
  const writeSource = firstSources.find((source) => source.accessRole === "owner");
  await prisma.calendarPreference.create({
    data: {
      userId,
      defaultConnectionId: first.id,
      writeSourceId: writeSource?.id,
    },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/account/settings");
  await expect(page.getByRole("heading", { name: "Calendar connections" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "calendar-a@example.com" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "calendar-b@example.com" })
  ).toBeVisible();
  await expect(page.getByText("Reauthorization required")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Personal/ })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Use Company holidays for new events" })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use Personal for new events" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Refresh all calendars" })).toHaveCount(1);

  const addButton = page.getByRole("link", { name: /Add Google account/ });
  const addBox = await addButton.boundingBox();
  expect(addBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.getByRole("button", { name: "Disconnect" }).first().click();
  const dialog = page.getByRole("alertdialog", {
    name: "Disconnect this Calendar account?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    localStorage.setItem("nexusdash-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();
});
