import { expect, type Locator } from "@playwright/test";

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
