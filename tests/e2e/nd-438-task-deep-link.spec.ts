import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

interface DeepLinkTask {
  id: string;
  title: string;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createDeepLinkProject(page: Page): Promise<{
  projectId: string;
  taskA: DeepLinkTask;
  taskB: DeepLinkTask;
}> {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd-438-deep-link"),
      description: "Deep-link fixture project.",
      ownerId: userId,
      memberships: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true },
  });

  const createTask = async (title: string): Promise<DeepLinkTask> => {
    const response = await page.request.post(
      `/api/projects/${project.id}/tasks`,
      {
        data: { title },
      }
    );
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as {
      taskId?: string;
      task?: { id?: string; title?: string };
    };
    const task = payload.task;
    expect(task?.id).toBeTruthy();
    expect(task?.title).toBe(title);
    return { id: task!.id!, title: task!.title! };
  };

  return {
    projectId: project.id,
    taskA: await createTask("ND-438 deep-link task A"),
    taskB: await createTask("ND-438 deep-link task B"),
  };
}

function trackTaskByIdFetches(page: Page): string[] {
  const fetches: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") {
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (/\/tasks\/[^/?#]+$/.test(pathname)) {
      fetches.push(pathname);
    }
  });
  return fetches;
}

test.describe("ND-438 deep-linked initial task", () => {
  test("opens a deep-linked task already present in the loaded board without fetching it", async ({
    page,
  }) => {
    const { projectId, taskA } = await createDeepLinkProject(page);
    const taskByIdFetches = trackTaskByIdFetches(page);

    await page.goto(`/projects/${projectId}?taskId=${taskA.id}#kanban`);

    await expect(
      page.getByRole("dialog", { name: taskA.title })
    ).toBeVisible();
    expect(taskByIdFetches).toHaveLength(0);
  });

  test("fetches and opens a deep-linked task whose id is absent from the loaded board", async ({
    page,
  }) => {
    const { projectId, taskA } = await createDeepLinkProject(page);
    const ghostTaskId = `nd438-ghost-${uniqueSuffix()}`;
    const taskByIdFetches = trackTaskByIdFetches(page);

    // The board list can legitimately miss a target the by-id endpoint can
    // still resolve (stale server payload, out-of-band creation). Intercept
    // the by-id GET for an id the initial board does not contain and answer
    // with the canonical response of a real project task.
    await page.route(
      `**/api/projects/${projectId}/tasks/${ghostTaskId}`,
      async (route) => {
        if (route.request().method() !== "GET") {
          await route.fallback();
          return;
        }
        const realResponse = await page.request.get(
          `/api/projects/${projectId}/tasks/${taskA.id}`
        );
        expect(realResponse.ok()).toBeTruthy();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: await realResponse.text(),
        });
      }
    );

    await page.goto(`/projects/${projectId}?taskId=${ghostTaskId}#kanban`);

    await expect(
      page.getByRole("dialog", { name: taskA.title })
    ).toBeVisible();
    expect(taskByIdFetches).toEqual([
      `/api/projects/${projectId}/tasks/${ghostTaskId}`,
    ]);
  });

  test("keeps the board unchanged when the deep-linked task cannot be fetched", async ({
    page,
  }) => {
    const { projectId } = await createDeepLinkProject(page);
    const missingTaskId = `nd438-missing-${uniqueSuffix()}`;
    const taskByIdFetches = trackTaskByIdFetches(page);

    await page.goto(`/projects/${projectId}?taskId=${missingTaskId}#kanban`);

    await expect(
      page.getByRole("heading", { name: "Kanban board" })
    ).toBeVisible();
    await expect
      .poll(() => taskByIdFetches)
      .toEqual([`/api/projects/${projectId}/tasks/${missingTaskId}`]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
