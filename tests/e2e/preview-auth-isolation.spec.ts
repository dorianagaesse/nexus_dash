import { expect, test } from "@playwright/test";

const previewBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const shouldRunPreviewAuth = process.env.TASK370_PREVIEW_AUTH === "1";

test.describe("preview authentication isolation", () => {
  test.skip(
    !previewBaseUrl || !shouldRunPreviewAuth,
    "Set PLAYWRIGHT_BASE_URL and TASK370_PREVIEW_AUTH=1 for deployed-preview validation."
  );

  test("signup and subsequent signin remain on the immutable preview origin", async ({
    page,
  }) => {
    const previewOrigin = new URL(previewBaseUrl!).origin;
    const suffix = Date.now().toString(36);
    const username = `task370.${suffix}`.slice(0, 20);
    const email = `task370-preview-${suffix}@nexusdash.local`;
    const password = `Task370!Preview${suffix}`;

    await page.goto("/?form=signup");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create your account" }).click();

    await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
    expect(new URL(page.url()).origin).toBe(previewOrigin);

    await page.getByRole("button", { name: /^Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/(?:\?.*)?$/);
    expect(new URL(page.url()).origin).toBe(previewOrigin);

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in to NexusDash" }).click();

    await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
    expect(new URL(page.url()).origin).toBe(previewOrigin);
  });
});
