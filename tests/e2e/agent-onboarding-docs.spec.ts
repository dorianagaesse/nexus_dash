import { expect, test } from "@playwright/test";

test("hosted identity setup explains both access paths and fits narrow screens", async ({ page }) => {
  await page.goto("/docs/agent/v1");
  await expect(page.getByRole("heading", { name: "Authorize an identity", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Use your current client", exact: true })).toBeVisible();
  await expect(page.getByText("Legacy API credentials remain a supported option.", { exact: false })).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
