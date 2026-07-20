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
    await expect(page.getByText("Agent access, built for real work")).toBeVisible();
    await expect(page.getByText("Project context, kept together")).toBeVisible();
    await expect(
      page.getByText(
        "Give everyone one reliable place for project context and the files behind the work."
      )
    ).toBeVisible();
    await expect(page.getByText("Meetings become visible action")).toBeVisible();
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
    const continueWithEmail = page.getByRole("button", {
      name: "Continue with email",
    });
    if (await continueWithEmail.isVisible()) {
      await expect(page.getByLabel("Email address")).not.toBeVisible();
      await continueWithEmail.click();
      await expect(
        page.getByRole("link", { name: /Continue with/ }).first()
      ).not.toBeVisible();
    }
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your account" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    expect(dimensions.height).toBeLessThan(1300);
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
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

  test("persists the selected theme across reloads", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByText("Agent access, built for real work")).toBeVisible();

    await page.reload();

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Switch to light mode" })
    ).toBeVisible();
  });

  test("highlights and attracts the connected node field around a precise pointer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    const nodeField = page.locator(".home-interactive-node-field");
    await expect(nodeField).toBeVisible();
    await expect(nodeField).toHaveAttribute("data-active", "false");
    await expect(nodeField).toHaveAttribute("data-constellation-seed", /\d+/);
    await expect(nodeField).toHaveAttribute("data-node-count", "96");
    const linkCount = Number(await nodeField.getAttribute("data-link-count"));
    expect(linkCount).toBeGreaterThan(235);
    const firstSeed = await nodeField.getAttribute("data-constellation-seed");
    const strongLinkCount = Number(
      await nodeField.getAttribute("data-strong-links")
    );
    expect(strongLinkCount).toBeGreaterThan(0);

    await page.reload();
    await expect
      .poll(() => nodeField.getAttribute("data-constellation-seed"))
      .not.toBe(firstSeed);

    await page.mouse.move(720, 500);
    await expect(nodeField).toHaveAttribute("data-active", "true");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(nodeField).toHaveAttribute("data-interactive", "false");
    await page.mouse.move(240, 240);
    await expect(nodeField).toHaveAttribute("data-active", "false");
  });
});
