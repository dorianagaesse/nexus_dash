import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

test("standalone checklist capture, edit, completion, reopen and project isolation", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: { name: "Quick project checklist", ownerId: userId },
  });
  const other = await prisma.user.create({ data: { name: "Other owner" } });
  const foreign = await prisma.project.create({
    data: {
      name: "Hidden checklist",
      ownerId: other.id,
      todos: { create: { content: "Private project item" } },
    },
    include: { todos: true },
  });
  try {
    await page.goto(`/projects/${project.id}/todos`);
    const checklist = page.getByRole("region", {
      name: "Checklist",
      exact: true,
    });
    await checklist.getByLabel("New checklist item").fill("Pack the demo kit");
    await page.route(
      `**/api/projects/${project.id}/todos`,
      async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"temporary-failure"}',
          });
        } else await route.continue();
      },
      { times: 1 }
    );
    await checklist.getByRole("button", { name: "Add item" }).click();
    await expect(checklist.getByRole("alert")).toContainText("Could not save");
    await expect(checklist.getByLabel("New checklist item")).toHaveValue(
      "Pack the demo kit"
    );
    await checklist.getByLabel("New checklist item").press("Enter");
    await expect(
      checklist.getByText("Pack the demo kit", { exact: true })
    ).toBeVisible();
    await expect(checklist.getByLabel("New checklist item")).toBeEmpty();
    await checklist
      .getByRole("button", { name: "Edit: Pack the demo kit" })
      .click();
    await checklist
      .getByLabel("Edit checklist item")
      .fill("Pack the demo kit and charger");
    await checklist.getByRole("button", { name: "Save item" }).click();
    const title = "Pack the demo kit and charger";
    await expect(checklist.getByText(title, { exact: true })).toBeVisible();
    await checklist
      .getByRole("checkbox", { name: `Complete: ${title}` })
      .check();
    await expect(checklist.getByText(title, { exact: true })).toHaveCount(0);
    await checklist.getByRole("button", { name: "Completed (1)" }).click();
    await expect(checklist.getByText(title, { exact: true })).toBeVisible();
    await checklist
      .getByRole("checkbox", { name: `Reopen: ${title}` })
      .uncheck();
    await checklist.getByRole("button", { name: "Open (1)" }).click();
    await page.reload();
    await expect(checklist.getByText(title, { exact: true })).toBeVisible();
    const base = `/api/projects/${project.id}/todos`;
    const list = await page.request.get(base);
    const item = (await list.json()).todos[0];
    const stale = await page.request.patch(`${base}/${item.id}`, {
      data: { revision: 0, content: "Stale text" },
    });
    expect(stale.status()).toBe(409);
    expect(
      (await page.request.get(`/api/projects/${foreign.id}/todos`)).status()
    ).toBe(404);
    expect(
      (
        await page.request.patch(`${base}/${foreign.todos[0].id}`, {
          data: { revision: 0, completed: true },
        })
      ).status()
    ).toBe(409);
    await mkdir(".tmp/checklist-review", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: ".tmp/checklist-review/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".tmp/checklist-review/mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await checklist.getByRole("button", { name: `Delete: ${title}` }).click();
    await expect(checklist.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    await prisma.project.deleteMany({
      where: { id: { in: [project.id, foreign.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, other.id] } } });
  }
});

test("viewer can read but cannot capture, edit, complete or delete checklist items", async ({
  page,
}) => {
  const viewer = await signInAsVerifiedUser(page);
  const owner = await prisma.user.create({ data: { name: "Checklist owner" } });
  const project = await prisma.project.create({
    data: {
      name: "Shared checklist",
      ownerId: owner.id,
      memberships: { create: { userId: viewer, role: "viewer" } },
      todos: { create: { content: "Owner item" } },
    },
    include: { todos: true },
  });
  try {
    await page.goto(`/projects/${project.id}/todos`);
    const checklist = page.getByRole("region", {
      name: "Checklist",
      exact: true,
    });
    await expect(
      checklist.getByText("Owner item", { exact: true })
    ).toBeVisible();
    await expect(checklist.getByLabel("New checklist item")).toHaveCount(0);
    await expect(
      checklist.getByRole("checkbox", { name: "Complete: Owner item" })
    ).toBeDisabled();
    const base = `/api/projects/${project.id}/todos`;
    expect(
      (
        await page.request.post(base, { data: { content: "Forbidden" } })
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${base}/${project.todos[0].id}`, {
          data: { revision: 0, completed: true },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.delete(`${base}/${project.todos[0].id}`, {
          data: { revision: 0 },
        })
      ).status()
    ).toBe(403);
    await prisma.projectMembership.deleteMany({
      where: { projectId: project.id, userId: viewer },
    });
    expect((await page.request.get(base)).status()).toBe(404);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [viewer, owner.id] } } });
  }
});
