import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/services/password-service";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}

function randomUsernameDiscriminator(): string {
  return Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
}

test.describe("password recovery flow", () => {
  test("forgot-password request creates reset token without account enumeration", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const email = `recover-${suffix}@nexusdash.local`;
    const passwordHash = await hashPassword("StartPass!1");
    const user = await prisma.user.create({
      data: {
        email,
        name: "Recovery User",
        username: `recover${suffix.replace(/[^a-z0-9]/g, "").slice(0, 8)}`,
        usernameDiscriminator: randomUsernameDiscriminator(),
        passwordHash,
        emailVerified: new Date(),
      },
      select: {
        id: true,
      },
    });

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page).toHaveURL(/\/forgot-password\?status=request-submitted/);
    await expect(
      page.getByText("If an account matches that email, a password reset link is on its way.")
    ).toBeVisible();

    const createdTokenCount = await prisma.passwordResetToken.count({
      where: {
        userId: user.id,
      },
    });
    expect(createdTokenCount).toBeGreaterThan(0);
  });

  test("reset-password consumes token, revokes sessions, and rotates sign-in password", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const email = `reset-${suffix}@nexusdash.local`;
    const oldPassword = "StartPass!1";
    const newPassword = "UpdatedPass!2";

    const user = await prisma.user.create({
      data: {
        email,
        name: "Reset User",
        username: `reset${suffix.replace(/[^a-z0-9]/g, "").slice(0, 9)}`,
        usernameDiscriminator: randomUsernameDiscriminator(),
        passwordHash: await hashPassword(oldPassword),
        emailVerified: new Date(),
      },
      select: {
        id: true,
      },
    });

    const existingSessionToken = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionToken: existingSessionToken,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const primaryRawToken = randomBytes(32).toString("base64url");
    const secondaryRawToken = randomBytes(32).toString("base64url");
    const primaryTokenRecord = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        email,
        tokenHash: hashResetToken(primaryRawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: {
        id: true,
      },
    });
    const secondaryTokenRecord = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        email,
        tokenHash: hashResetToken(secondaryRawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: {
        id: true,
      },
    });

    await page.goto(`/reset-password?token=${primaryRawToken}`);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL(/\/\?form=signin&status=password-reset-success/);
    await expect(
      page.getByText("Password reset complete. Sign in with your new password.")
    ).toBeVisible();

    const activeSessionCount = await prisma.session.count({
      where: {
        userId: user.id,
      },
    });
    expect(activeSessionCount).toBe(0);

    const consumedPrimaryToken = await prisma.passwordResetToken.findUnique({
      where: {
        id: primaryTokenRecord.id,
      },
      select: {
        consumedAt: true,
      },
    });
    const consumedSecondaryToken = await prisma.passwordResetToken.findUnique({
      where: {
        id: secondaryTokenRecord.id,
      },
      select: {
        consumedAt: true,
      },
    });
    expect(consumedPrimaryToken?.consumedAt).toBeTruthy();
    expect(consumedSecondaryToken?.consumedAt).toBeTruthy();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    await page.getByRole("button", { name: "Continue to dashboard" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();

    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Continue to dashboard" }).click();
    await expect(page).toHaveURL(/\/projects(\?.*)?$/);
  });
});
