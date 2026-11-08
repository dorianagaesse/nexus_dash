import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

test("one list preserves meeting actions and adds private personal todos", async ({
  page,
  browser,
  baseURL,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const memberPage = await browser.newPage({ baseURL });
  const memberId = await signInAsVerifiedUser(memberPage);
  const project = await prisma.project.create({
    data: {
      name: "Launch preparation",
      ownerId: userId,
      memberships: { create: { userId: memberId, role: "editor" } },
      meetingNotes: {
        create: {
          title: "Launch planning",
          status: "actions_in_progress",
          inputNotes: "Private meeting notes",
          outputNotes: "",
          createdByUserId: userId,
          updatedByUserId: userId,
          visibility: "private",
          actions: {
            create: {
              content: "Confirm the launch date with the team",
              creatorKind: "human",
              createdByUserId: userId,
              creatorDisplayNameSnapshot: "Project owner",
              position: 0,
            },
          },
        },
      },
      todos: {
        create: {
          content: "Member's secret personal item",
          createdByUserId: memberId,
        },
      },
    },
    include: { todos: true },
  });
  const foreign = await prisma.project.create({
    data: {
      name: "Another project",
      ownerId: memberId,
      todos: {
        create: { content: "Foreign secret", createdByUserId: memberId },
      },
    },
    include: { todos: true },
  });
  try {
    await page.goto(`/projects/${project.id}/todos`);
    await expect(
      page.getByRole("region", { name: "Open todos", exact: true })
    ).toHaveCount(1);
    await expect(
      page.getByText("Confirm the launch date with the team", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Project members", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Member's secret personal item", { exact: true })
    ).toHaveCount(0);
    const input = page.getByLabel("Add a todo for yourself");
    await input.fill("Pack the demo kit");
    await page.route(
      `**/api/projects/${project.id}/todos`,
      async (route) => {
        if (route.request().method() === "POST")
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: "{}",
          });
        else await route.continue();
      },
      { times: 1 }
    );
    await page.getByRole("button", { name: "Add todo", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not save");
    await expect(input).toHaveValue("Pack the demo kit");
    await input.press("Enter");
    await expect(
      page.getByText("Pack the demo kit", { exact: true })
    ).toBeVisible();
    await expect(input).toBeEmpty();
    await page
      .getByRole("button", { name: "Edit: Pack the demo kit", exact: true })
      .click();
    await page
      .getByLabel("Edit personal todo")
      .fill("Pack the demo kit and charger");
    await page.getByRole("button", { name: "Save todo", exact: true }).click();
    const title = "Pack the demo kit and charger";
    await page
      .getByRole("button", { name: `Complete todo: ${title}`, exact: true })
      .click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Todo views" })
      .getByRole("link", { name: /Completed/i })
      .click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: `Reopen todo: ${title}`, exact: true })
      .click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Todo views" })
      .getByRole("link", { name: /Open/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/todos$`));
    await page.reload();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Todo responsibility" })
      .getByRole("link", { name: /Assigned to me/ })
      .click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Confirm the launch date with the team", { exact: true })
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Todo responsibility" })
      .getByRole("link", { name: /^All/ })
      .click();

    const base = `/api/projects/${project.id}/todos`;
    const item = (await (await page.request.get(base)).json()).todos[0];
    expect(
      (
        await page.request.patch(`${base}/${item.id}`, {
          data: { revision: 0, content: "Stale" },
        })
      ).status()
    ).toBe(409);
    expect(
      (await page.request.get(`/api/projects/${foreign.id}/todos`)).status()
    ).toBe(404);
    for (const hidden of [project.todos[0], foreign.todos[0]]) {
      expect(
        (
          await page.request.patch(`${base}/${hidden.id}`, {
            data: { revision: 0, completed: true },
          })
        ).status()
      ).toBe(409);
      expect(
        (
          await page.request.delete(`${base}/${hidden.id}`, {
            data: { revision: 0 },
          })
        ).status()
      ).toBe(409);
    }
    await memberPage.goto(`/projects/${project.id}/todos`);
    await expect(memberPage.getByText(title, { exact: true })).toHaveCount(0);
    const memberList = await (await memberPage.request.get(base)).json();
    expect(memberList.todos.map((entry: { id: string }) => entry.id)).toEqual([
      project.todos[0].id,
    ]);
    expect(
      (
        await memberPage.request.patch(`${base}/${item.id}`, {
          data: { revision: item.revision, completed: true },
        })
      ).status()
    ).toBe(409);
    const summary = await (
      await page.request.get(
        `/api/projects/${project.id}/meeting-todos/summary`
      )
    ).json();
    expect(summary.activeCount).toBe(2); // One meeting action + this actor's personal todo.
    expect(
      (
        await memberPage.request.delete(`${base}/${project.todos[0].id}`, {
          data: { revision: 0 },
        })
      ).status()
    ).toBe(200);

    await mkdir(".tmp/personal-todos-review", { recursive: true });
    for (const [name, width, height, dark] of [
      ["desktop", 1440, 1000, false],
      ["mobile", 375, 812, false],
      ["mobile-dark", 375, 812, true],
      ["landscape", 812, 375, false],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        dark
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      const path = `.tmp/personal-todos-review/${name}.png`;
      await page.screenshot({ path, fullPage: true });
      await test.info().attach(name, { path, contentType: "image/png" });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: `Delete: ${title}`, exact: true })
      .click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    await memberPage.close();
    await prisma.project.deleteMany({
      where: { id: { in: [project.id, foreign.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, memberId] } } });
  }
});

test("viewer sees only their own saved personal todos and revocation removes access", async ({
  page,
}) => {
  const viewer = await signInAsVerifiedUser(page);
  const owner = await prisma.user.create({ data: { name: "Project owner" } });
  const project = await prisma.project.create({
    data: {
      name: "Read-only personal todos",
      ownerId: owner.id,
      memberships: { create: { userId: viewer, role: "viewer" } },
      todos: {
        create: [
          { content: "My saved item", createdByUserId: viewer },
          { content: "Owner's private item", createdByUserId: owner.id },
        ],
      },
    },
    include: { todos: true },
  });
  try {
    await page.goto(`/projects/${project.id}/todos`);
    await expect(
      page.getByText("My saved item", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Owner's private item", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByLabel("Add a todo for yourself")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Complete todo: My saved item",
        exact: true,
      })
    ).toBeDisabled();
    const base = `/api/projects/${project.id}/todos`;
    const item = project.todos.find((todo) => todo.createdByUserId === viewer)!;
    expect(
      (
        await page.request.post(base, { data: { content: "Forbidden" } })
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${base}/${item.id}`, {
          data: { revision: 0, completed: true },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.delete(`${base}/${item.id}`, {
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
