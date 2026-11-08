import { expect, type Page } from "@playwright/test";

export async function copyAndCloseAgentKey(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const dialog = page.getByRole("dialog", {
    name: /^(Your agent credential is ready|Save your replacement API key)$/,
  });
  const action = page.getByRole("button", { name: "Copy and close", exact: true });
  await action.click();
  await expect(dialog).toHaveCount(0);
}
