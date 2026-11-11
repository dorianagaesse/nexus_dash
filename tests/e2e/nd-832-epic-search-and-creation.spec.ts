import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { clickUntilVisible } from "./helpers/interaction-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

for (const { layout, width, height } of [
  { layout: "desktop", width: 1440, height: 900 },
  { layout: "mobile", width: 375, height: 812 },
]) {
  test.describe(layout, () => {
    test.use({
      viewport: { width, height },
      isMobile: layout === "mobile",
      hasTouch: layout === "mobile",
    });

    test("browses and searches epics, and creates one from the shared dialog", async ({
      page,
    }) => {
      const userId = await signInAsVerifiedUser(page);
      const project = await prisma.project.create({
        data: {
          name: uniqueProjectName("nd-832-epics"),
          description: "Epic search and creation coverage.",
          ownerId: userId,
          memberships: { create: { userId, role: "owner" } },
        },
        select: { id: true },
      });
      await prisma.epic.createMany({
        data: [
          {
            name: "Workspace rollout",
            description: "Plan the accessibility review.",
          },
          { name: "Release notes", description: "Summarize new features." },
          {
            name: "Account refresh",
            description: "Completed the accessibility review.",
            archivedAt: new Date(),
          },
        ].map((epic) => ({
          ...epic,
          projectId: project.id,
          createdByUserId: userId,
          updatedByUserId: userId,
        })),
      });

      await page.goto(`/projects/${project.id}#epics`);
      const search = page.getByRole("textbox", { name: "Search epics" });
      const view = page.getByRole("group", { name: "Epic list view" });
      const showAll = page.getByRole("button", { name: "Show all", exact: true });
      const rollout = page.getByRole("article", { name: "Workspace rollout" });
      const releaseNotes = page.getByRole("article", { name: "Release notes" });
      const accountRefresh = page.getByRole("article", { name: "Account refresh" });

      await expect(search).toBeVisible();
      await expect(rollout).toHaveCount(0);
      await expect(releaseNotes).toHaveCount(0);
      await clickUntilVisible(showAll, rollout);
      await expect(releaseNotes).toBeVisible();
      await expect(accountRefresh).toHaveCount(0);
      await page.getByRole("button", { name: "Hide list", exact: true }).click();
      await expect(rollout).toHaveCount(0);

      await search.fill("  ACCESSIBILITY REVIEW  ");
      await expect(rollout).toBeVisible();
      await expect(releaseNotes).toHaveCount(0);
      await expect(accountRefresh).toHaveCount(0);
      await view.getByRole("button", { name: "Archived (1)" }).click();
      await expect(accountRefresh).toBeVisible();
      await expect(rollout).toHaveCount(0);

      await search.fill("does not exist");
      await expect(
        page.getByRole("status").filter({ hasText: "No matching epics." })
      ).toBeVisible();
      await page.getByRole("button", { name: "Clear epic search" }).click();
      await expect(search).toBeFocused();
      await expect(accountRefresh).toHaveCount(0);
      await showAll.click();
      await expect(accountRefresh).toBeVisible();
      await expect(rollout).toHaveCount(0);

      const newEpic = page.getByRole("button", { name: "New epic" });
      const dialog = page.getByRole("dialog", { name: "New epic" });
      const name = dialog.getByLabel("Name", { exact: true });
      const description = dialog.getByLabel("Description", { exact: true });
      await newEpic.click();
      await expect(name).toBeFocused();
      await name.fill("Canceled initiative");
      await description.fill("This draft should be discarded.");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(newEpic).toBeFocused();
      expect(await prisma.epic.count({ where: { projectId: project.id } })).toBe(
        3
      );

      await newEpic.click();
      await expect(name).toHaveValue("");
      await expect(description).toHaveValue("");
      await name.fill("Onboarding guide");
      await description.fill("Document the first week.");
      const createResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith(`/api/projects/${project.id}/epics`)
      );
      await dialog.getByRole("button", { name: "Create epic" }).click();
      expect((await createResponse).ok()).toBe(true);
      await expect(dialog).toBeHidden();
      await expect(
        view.getByRole("button", { name: "Active (3)" })
      ).toHaveAttribute("aria-pressed", "true");
      await search.fill("onboarding");
      const createdEpic = page.getByRole("article", { name: "Onboarding guide" });
      await expect(createdEpic).toBeVisible();
      await search.fill("");
      await expect(createdEpic).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
    });
  });
}
