import { expect, test } from "@playwright/test";

test.describe("unauthenticated home entry", () => {
  test("keeps sign-in immediate and communicates product outcomes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Turn plans into progress—without losing context.",
      })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByText("session model")).toHaveCount(0);
    await expect(page.getByText("authorization boundary")).toHaveCount(0);
  });

  test("uses an auth-first compact mobile sign-up layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?form=signup");

    await expect(
      page.getByRole("heading", { name: "Start your workspace" })
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your account" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    expect(dimensions.height).toBeLessThan(1200);
    expect(dimensions.width).toBe(dimensions.viewportWidth);
  });

  test("stays contained at tablet width with reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();

    const layout = await page.evaluate(() => {
      const emailInput = document.getElementById("signin-email");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        transitionProperty:
          emailInput instanceof HTMLElement
            ? getComputedStyle(emailInput).transitionProperty
            : null,
      };
    });

    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.transitionProperty).toBe("none");
  });
});
