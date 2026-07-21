import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";

const screenshotDirectory = process.env.TASK_324_SCREENSHOT_DIR?.trim();

async function applyTheme(
  page: Parameters<typeof signInAsVerifiedUser>[0],
  theme: "light" | "dark"
) {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem("nexusdash-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
}

test.describe("unified user hub navigation", () => {
  test("supports keyboard route switching and browser history", async ({ page }) => {
    await signInAsVerifiedUser(page);
    await page.goto("/account?returnTo=%2Fprojects");

    const navigation = page.getByRole("navigation", {
      name: "User hub navigation",
    });
    const account = navigation.getByRole("link", { name: "Account" });
    const settings = navigation.getByRole("link", { name: "Settings" });

    await expect(account).toHaveAttribute("aria-current", "page");
    await account.focus();
    await page.keyboard.press("Tab");
    await expect(settings).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/account\/settings\?returnTo=/);
    await expect(
      page
        .getByRole("navigation", { name: "User hub navigation" })
        .getByRole("link", { name: "Settings" })
    ).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await expect(page).toHaveURL(/\/account\?returnTo=/);
    await page.goForward();
    await expect(page).toHaveURL(/\/account\/settings\?returnTo=/);
  });

  test("passes responsive light and dark visual walkthroughs", async ({ page }) => {
    await signInAsVerifiedUser(page);

    const walkthroughs = [
      {
        width: 375,
        height: 812,
        route: "/account",
        current: "Account",
        theme: "light" as const,
      },
      {
        width: 768,
        height: 900,
        route: "/account/settings",
        current: "Settings",
        theme: "dark" as const,
      },
      {
        width: 1024,
        height: 900,
        route: "/account/notifications",
        current: "Notifications",
        theme: "light" as const,
      },
      {
        width: 1440,
        height: 1000,
        route: "/account",
        current: "Account",
        theme: "dark" as const,
      },
    ];

    if (screenshotDirectory) {
      await mkdir(path.resolve(screenshotDirectory), { recursive: true });
    }

    for (const walkthrough of walkthroughs) {
      await page.setViewportSize({
        width: walkthrough.width,
        height: walkthrough.height,
      });
      await page.goto(`${walkthrough.route}?returnTo=%2Fprojects`);
      await applyTheme(page, walkthrough.theme);

      const navigation = page.getByRole("navigation", {
        name: "User hub navigation",
      });
      const currentLink = navigation.getByRole("link", {
        name: walkthrough.current,
      });
      await expect(currentLink).toHaveAttribute("aria-current", "page");

      const targetSizes = await navigation.getByRole("link").evaluateAll((links) =>
        links.map((link) => {
          const rect = link.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      );
      expect(targetSizes.every(({ height }) => height >= 44)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBe(true);
      await expect(page.locator("html")).toHaveClass(
        walkthrough.theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/
      );

      if (walkthrough.width === 1440) {
        await page.getByRole("button", { name: /Account menu/ }).click();
        await expect(page.getByRole("menu", { name: "Account actions" })).toBeVisible();
      }

      if (screenshotDirectory) {
        await page.screenshot({
          path: path.resolve(
            screenshotDirectory,
            `${walkthrough.width}-${walkthrough.current.toLowerCase()}-${walkthrough.theme}.png`
          ),
          fullPage: true,
        });
      }
    }
  });
});
