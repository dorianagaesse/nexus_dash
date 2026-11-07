import { expect, type Page } from "@playwright/test";

export async function copyAndCloseAgentKey(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const action = page.getByRole("button", { name: "Copy and close", exact: true });
  await action.click();
  await expect(action).toHaveCount(0);
}
