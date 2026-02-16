import { expect, type Page } from "@playwright/test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueProjectName(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}`;
}

export async function createProjectFromProjectsPage(
  page: Page,
  projectName: string,
  description = "Smoke test project"
): Promise<void> {
  await page.goto("/projects");

  await page.getByRole("button", { name: "Create project" }).first().click();
  await expect(page.locator("#create-name")).toBeVisible();

  await page.locator("#create-name").fill(projectName);
  await page.locator("#create-description").fill(description);

  const createForm = page.locator("#create-name").locator("xpath=ancestor::form");
  await createForm.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("Project created successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
}

export async function openNewestProjectDashboard(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Open dashboard" }).first().click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+/);
  await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();
}
