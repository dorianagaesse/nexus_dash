import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test.describe("accessible overlay foundation", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsVerifiedUser(page);
    const projectName = uniqueProjectName("overlay-a11y");
    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);
  });

  test("contains and restores keyboard focus with named modal semantics", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "New task" });
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
    await expect(page.locator("#task-title")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("[role='dialog']"))
        )
      )
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("keeps the 390px sheet internally scrollable and removes overlay motion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "New task" }).click();

    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog).toBeVisible();
    const geometry = await dialog.boundingBox();
    expect(geometry).not.toBeNull();
    expect(Math.round((geometry?.y ?? 0) + (geometry?.height ?? 0))).toBe(844);
    expect(geometry?.width).toBeLessThanOrEqual(390);

    const scrollResult = await dialog.evaluate((element) => {
      const scrollRegion = Array.from(element.querySelectorAll<HTMLElement>("*"))
        .find((candidate) => {
          const style = getComputedStyle(candidate);
          return style.overflowY === "auto" && candidate.scrollHeight > candidate.clientHeight;
        });
      if (!scrollRegion) return null;
      scrollRegion.scrollTop = Math.min(200, scrollRegion.scrollHeight - scrollRegion.clientHeight);
      return { scrollTop: scrollRegion.scrollTop, animationDuration: getComputedStyle(element).animationDuration };
    });

    expect(scrollResult?.scrollTop).toBeGreaterThan(0);
    expect(scrollResult?.animationDuration).toBe("0s");
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
  });
});
