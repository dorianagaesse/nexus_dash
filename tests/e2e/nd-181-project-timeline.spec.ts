import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

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

test.describe("ND-181 durable project timeline", () => {
  test("records a UI task creation and renders it from the durable history API", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertServingLocalBuild(page);
    const actorUserId = await signInAsVerifiedUser(page);

    const actor = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { username: true, name: true },
    });
    const actorDisplayName = actor.username ?? actor.name ?? "Account";

    const projectName = uniqueProjectName("nd181-timeline");
    await createProjectFromProjectsPage(page, projectName);
    await openNewestProjectDashboard(page, projectName);

    const projectId = page.url().match(/\/projects\/([^/?#]+)/)?.[1];
    expect(projectId).toBeTruthy();
    const projectIdValue = projectId as string;

    const taskTitle = uniqueProjectName("history-task");
    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.locator("#task-title")).toBeVisible();
    await page.locator("#task-title").fill(taskTitle);

    const createTaskRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/tasks$/.test(response.url()) &&
        response.ok()
    );
    await page.getByRole("button", { name: "Create task" }).click();
    await createTaskRequest;
    await expect(
      page.getByRole("button", { name: new RegExp(taskTitle) }).first()
    ).toBeVisible();

    // The timeline is collapsed by default and only queries on expand.
    const timelineToggle = page
      .getByRole("button", { name: /Timeline/ })
      .first();
    await expect(timelineToggle).toHaveAttribute("aria-expanded", "false");

    const historyRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes(`/api/projects/${projectIdValue}/history`)
    );
    await timelineToggle.click();
    expect((await historyRequest).ok()).toBeTruthy();
    await expect(timelineToggle).toHaveAttribute("aria-expanded", "true");

    const entry = page.locator("[data-timeline-entry]").first();
    await expect(entry).toContainText(actorDisplayName);
    await expect(entry).toContainText(`Created task "${taskTitle}"`);

    // The durable API serves the same entry without transport payloads.
    const historyResponse = await page.request.get(
      `/api/projects/${projectIdValue}/history?take=25`
    );
    expect(historyResponse.ok()).toBeTruthy();
    expect(historyResponse.headers()["cache-control"]).toBe("no-store");

    const body = (await historyResponse.json()) as {
      entries: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    const taskEntry = body.entries.find(
      (candidate) => candidate.summary === `Created task "${taskTitle}"`
    );
    expect(taskEntry).toBeTruthy();
    expect(taskEntry?.entityDisplayNameSnapshot).toBe(taskTitle);
    expect(taskEntry).not.toHaveProperty("payload");
    expect(taskEntry?.actor).toMatchObject({
      kind: "human",
      displayName: actorDisplayName,
      status: "active",
      isAssignable: true,
    });
    expect(body.nextCursor).toBeNull();
  });
});
