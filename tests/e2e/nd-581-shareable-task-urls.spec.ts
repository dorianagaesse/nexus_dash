import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";
import { hashPassword } from "../../lib/services/password-service";

test("task URLs survive reload, close, history, and related-task navigation", async ({ page, context }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd581"), ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
  });
  const a = await prisma.task.create({ data: {
    projectId: project.id, title: "Shareable task A",
    createdByUserId: userId, updatedByUserId: userId,
  } });
  const response = await page.request.post(`/api/projects/${project.id}/tasks`, {
    data: { title: "Shareable task B", relatedTaskIds: [a.id] },
  });
  expect(response.ok()).toBeTruthy();
  const { task: b } = await response.json();

  await page.goto(`/projects/${project.id}?keep=value#kanban`);
  const boardToggle = page.getByRole("button", { name: /Kanban board/ });
  if (await boardToggle.getAttribute("aria-expanded") === "false") await boardToggle.click();
  await page.locator(`[data-kanban-task-card="${a.id}"]`).click();
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`keep=value&taskId=${a.id}#kanban$`));

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${new URL(page.url()).origin}/projects/${project.id}?taskId=${a.id}#kanban`);
  await page.reload();
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`projects/${project.id}\\?keep=value#kanban$`));
  await page.goBack();
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("Clipboard denied")),
    });
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Could not copy" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(copied);
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(b.title) }).click();
  await expect(page.getByRole("dialog", { name: b.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`taskId=${b.id}#kanban$`));
  await page.goBack();
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/nd-581-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/nd-581-desktop.png" });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword("ShareTask!123") },
  });
  await context.clearCookies();
  await page.goto("/");
  await page.goto(copied);
  await expect(page).toHaveURL(/returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(`/projects/${project.id}?taskId=${a.id}`);
  await page.locator("#signin-email").fill(user.email!);
  await page.locator("#signin-password").fill("ShareTask!123");
  await page.getByRole("button", { name: "Sign in to NexusDash", exact: true }).click();
  await expect(page.getByRole("dialog", { name: a.title, exact: true })).toBeVisible();
});
