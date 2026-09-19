import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";

const settingsSection = (page: Parameters<typeof signInAsVerifiedUser>[0]) =>
  page.locator('section[aria-labelledby="account-settings-heading"]');

test.describe("account developers surface", () => {
  test("stacks every section in one column with only the first section open", async ({
    page,
  }) => {
    await signInAsVerifiedUser(page);
    await page.goto("/account/settings/developers");

    const settings = settingsSection(page);
    await expect(settings).toBeVisible();

    await expect(settings.locator('[class*="xl:grid-cols"]')).toHaveCount(0);

    const expandedToggles = settings.getByRole("button", { expanded: true });
    await expect(expandedToggles).toHaveCount(1);
    await expect(expandedToggles).toHaveText(/Where credentials live/);

    await expect(settings.locator("button[aria-controls]").first()).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(
      settings.getByRole("button", { name: "Authentication flow" })
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      settings.getByRole("button", { name: "Copy-paste smoke test" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("reveals and hides section content through the disclosure pattern", async ({
    page,
  }) => {
    await signInAsVerifiedUser(page);
    await page.goto("/account/settings/developers");

    const toggle = settingsSection(page).getByRole("button", {
      name: "Authentication flow",
    });
    const controlsId = await toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    const region = page.locator(`[id="${controlsId}"]`);
    await expect(region).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(region).toBeVisible();
    await expect(
      region.getByText("Owner creates a project-scoped credential.")
    ).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(region).toBeHidden();
  });

  test("keeps the hosted docs surface flat without disclosure toggles", async ({
    page,
  }) => {
    await signInAsVerifiedUser(page);
    await page.goto("/docs/agent/v1");

    await expect(
      page.getByRole("heading", { name: "Quickstart environment" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "OpenAPI JSON" })).toBeVisible();
    await expect(page.locator("main button[aria-expanded]")).toHaveCount(0);
  });
});
