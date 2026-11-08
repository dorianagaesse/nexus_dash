import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";

const unknownPath = "/this-page-does-not-exist/nd-815";

test.describe("custom not-found page", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 1440]) {
      test(`renders an accessible ${theme} 404 at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => {
          localStorage.setItem("nexusdash-theme", value);
        }, theme);

        const response = await page.goto(unknownPath);

        expect(response?.status()).toBe(404);
        await expect(page.getByRole("main")).toContainText("NexusDash");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("404Page not found");
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
        await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^$/);

        const projectsLink = page.getByRole("link", { name: "Go to projects" });
        await expect(projectsLink).toHaveAttribute("href", "/projects");
        await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
        await projectsLink.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Go home" })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath("not-found.png"), fullPage: true });
      });
    }
  }

  test("lets signed-out visitors recover through home and projects", async ({ page }) => {
    await page.goto(unknownPath);
    await page.getByRole("link", { name: "Go home" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await page.goto(unknownPath);
    await page.getByRole("link", { name: "Go to projects" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("handles a missing project and recovers to the signed-in workspace", async ({ page }) => {
    await signInAsVerifiedUser(page);
    await page.goto("/projects/nd-815-missing-project");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("404Page not found");
    // The existing project loading boundary streams before notFound() resolves.
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await page.getByRole("link", { name: "Go to projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Page not found", exact: false })).toHaveCount(0);

    await page.goto(unknownPath);
    await page.getByRole("link", { name: "Go home" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });
});
