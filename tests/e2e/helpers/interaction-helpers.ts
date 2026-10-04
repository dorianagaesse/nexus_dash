import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Runs `activate` until `result` becomes visible.
 *
 * A click (or key press) dispatched after the page's `load` event but before
 * React hydrates is silently dropped, which makes bare clicks immediately
 * after `page.goto` or `page.reload()` flaky on slow machines. `activate` is
 * only retried while `result` is absent, so a successful toggle is never
 * undone. Failures thrown inside `activate` (the trigger disappearing once the
 * toggle landed) also just trigger a retry.
 */
export async function activateUntilVisible(
  result: Locator,
  activate: () => Promise<void>
): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible())) {
      await activate();
    }
    await expect(result).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

export async function clickUntilVisible(
  trigger: Locator,
  result: Locator
): Promise<void> {
  await activateUntilVisible(result, () =>
    trigger.click({ timeout: 1_000 })
  );
}

/**
 * Reloads the page, retrying when the navigation aborts (ERR_ABORTED, "maybe
 * frame was detached") because the app started its own reload concurrently -
 * e.g. the meeting-notes panel hard-reloads on remote activity events.
 */
export async function reloadUntilLoaded(page: Page): Promise<void> {
  await expect(async () => {
    await page.reload({ timeout: 10_000 });
  }).toPass({ timeout: 20_000 });
}
