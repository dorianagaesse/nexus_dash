import { expect, test } from "@playwright/test";

test.describe("public privacy policy", () => {
  test("is linked from the unauthenticated homepage", async ({ page }) => {
    await page.goto("/");

    const privacyLink = page.getByRole("link", { name: "Privacy policy" });
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" })
    ).toBeVisible();
  });

  test("discloses Google Calendar access and Limited Use without authentication", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/privacy");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Privacy Policy | NexusDash");
    await expect(page.getByText("https://www.googleapis.com/auth/calendar.events")).toBeVisible();
    await expect(page.getByText("OAuth tokens are encrypted", { exact: false })).toBeVisible();
    await expect(page.getByText("Limited Use requirements", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Google API Services User Data Policy/ })
    ).toHaveAttribute(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy"
    );

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
