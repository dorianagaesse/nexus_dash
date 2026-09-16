import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsUnverifiedUser } from "./helpers/auth-helpers";

async function assertServingLocalBuild(page: import("@playwright/test").Page) {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return;
  }
  // Playwright reuses any server already listening on its port
  // (reuseExistingServer). Several worktrees run `next start` on the same
  // machine, so fail fast when the port is serving another build instead of
  // letting it look like an app flake downstream.
  const { version } = JSON.parse(
    readFileSync("package.json", "utf8")
  ) as { version: string };
  const response = await page.goto("/");
  const html = (await response?.text()) ?? "";
  expect(
    html.includes(`v${version}`),
    `The server on ${page.url()} is not this worktree's build (expected v${version}). Another worktree's next start is occupying the test port.`
  ).toBe(true);
}

test.describe("verify-email status page", () => {
  test("shows a single instruction with manual fallback controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertServingLocalBuild(page);
    await signInAsUnverifiedUser(page);

    await page.goto("/verify-email");

    await expect(
      page.getByRole("heading", { name: "Verify your email" })
    ).toBeVisible();
    await expect(
      page.getByText(/Open the link to unlock your workspace/)
    ).toBeVisible();
    await expect(
      page.getByText("After clicking the verification link from your inbox")
    ).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: "I verified, continue" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resend verification email" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  });

  test("redirects to the workspace automatically once verification completes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertServingLocalBuild(page);
    const userId = await signInAsUnverifiedUser(page);

    await page.goto("/verify-email");
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(
      page.getByText(
        "This page will continue automatically once your email is verified."
      )
    ).toBeVisible();

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });

    await expect(page).toHaveURL(/\/projects(\?.*)?$/, { timeout: 20_000 });
  });
});
