import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

const TASKS_PER_LANE = 60;
const ARCHIVED_TASKS = 60;
const ACTIVE_TASKS = TASKS_PER_LANE * 4;
const LANES = ["Backlog", "In Progress", "Blocked", "Done"] as const;
const WARM_UP_SAMPLES = 2;
const MEASURED_SAMPLES = 20;

function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 10) / 10;
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95) };
}

test("ND-430 large-board responsiveness baseline", async ({ page }) => {
  test.skip(process.env.ND_KANBAN_AUDIT !== "1", "Run only for the manual performance audit");
  test.setTimeout(10 * 60_000);

  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: `ND-430 audit ${Date.now()}`,
      description: "Disposable large Kanban board performance fixture.",
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  const controlProject = await prisma.project.create({
    data: {
      name: `ND-430 control ${Date.now()}`,
      description: "Disposable small Kanban board performance control.",
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });

  try {
    await prisma.task.createMany({
      data: LANES.flatMap((status) =>
        Array.from({ length: 3 }, (_, position) => ({
          projectId: controlProject.id,
          title: `${status} control card ${position + 1}`,
          description: `<p>Planning details for ${status} task ${position + 1}.</p>`,
          labelsJson: JSON.stringify(["audit", "planned"]),
          status,
          position,
          createdByUserId: userId,
          updatedByUserId: userId,
          completedAt: status === "Done" ? new Date() : null,
        }))
      ),
    });
    await prisma.task.createMany({
      data: [
        ...LANES.flatMap((status) =>
          Array.from({ length: TASKS_PER_LANE }, (_, position) => ({
            projectId: project.id,
            title: `${status} audit card ${String(position + 1).padStart(2, "0")}`,
            description: `<p>Planning details for ${status} task ${position + 1}. This is a representative two-line card preview.</p>`,
            labelsJson: JSON.stringify(["audit", position % 3 === 0 ? "priority" : "planned"]),
            status,
            position,
            createdByUserId: userId,
            updatedByUserId: userId,
            completedAt: status === "Done" ? new Date() : null,
          }))
        ),
        ...Array.from({ length: ARCHIVED_TASKS }, (_, position) => ({
          projectId: project.id,
          title: `Archived audit card ${String(position + 1).padStart(2, "0")}`,
          description: "<p>Completed work retained in the archive.</p>",
          status: "Done",
          position: TASKS_PER_LANE + position,
          createdByUserId: userId,
          updatedByUserId: userId,
          completedAt: new Date(),
          archivedAt: new Date(),
        })),
      ],
    });

    const route = `/projects/${project.id}#kanban`;
    const loadSamples: number[] = [];
    const responseBytes: number[] = [];
    for (let iteration = 0; iteration < WARM_UP_SAMPLES + MEASURED_SAMPLES; iteration += 1) {
      const response = iteration === 0
        ? await page.goto(route, { waitUntil: "domcontentloaded" })
        : await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-kanban-task-card]")).toHaveCount(ACTIVE_TASKS);
      const elapsed = await page.evaluate(() => performance.now());
      if (iteration >= WARM_UP_SAMPLES) {
        loadSamples.push(elapsed);
        responseBytes.push((await response!.body()).byteLength);
      }
    }
    const largeDomElements = await page.evaluate(() => document.querySelectorAll("*").length);

    const card = page.locator("[data-kanban-task-card]").first();
    const modalSamples: number[] = [];
    for (let iteration = 0; iteration < WARM_UP_SAMPLES + MEASURED_SAMPLES; iteration += 1) {
      const started = await page.evaluate(() => performance.now());
      await card.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const elapsed = (await page.evaluate(() => performance.now())) - started;
      await page.getByRole("button", { name: "Close task" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      if (iteration >= WARM_UP_SAMPLES) modalSamples.push(elapsed);
    }

    const firstTaskId = await card.getAttribute("data-kanban-task-card");
    expect(firstTaskId).toBeTruthy();
    const remoteSamples: number[] = [];
    for (let iteration = 0; iteration < WARM_UP_SAMPLES + MEASURED_SAMPLES; iteration += 1) {
      const duration = await page.evaluate(
        ({ projectId, taskId, sequence }) =>
          new Promise<number>((resolve, reject) => {
            const cardElement = document.querySelector(
              `[data-kanban-task-card="${taskId}"]`
            );
            if (!cardElement) return reject(new Error("Audit task card disappeared"));
            const previousText = cardElement.textContent;
            const started = performance.now();
            const timeout = window.setTimeout(() => {
              observer.disconnect();
              reject(new Error("Remote event did not update the task card"));
            }, 5_000);
            const observer = new MutationObserver(() => {
              if (cardElement.textContent === previousText) return;
              observer.disconnect();
              window.clearTimeout(timeout);
              requestAnimationFrame(() =>
                resolve(performance.now() - started)
              );
            });
            observer.observe(cardElement, { childList: true, characterData: true, subtree: true });
            const detail = {
              activity: {
                eventId: `audit-${sequence}`,
                projectId,
                version: String(sequence + 1),
                serverTime: new Date().toISOString(),
                actorUserId: null,
                domain: "task-comment",
                action: "created",
                entityId: taskId,
                payload: { taskId },
              },
              handled: false,
              markHandled() { this.handled = true; },
            };
            window.dispatchEvent(new CustomEvent("nexusdash:project-activity-remote", { detail }));
            if (!detail.handled) {
              observer.disconnect();
              window.clearTimeout(timeout);
              reject(new Error("Remote task-comment event was not handled"));
            }
          }),
        { projectId: project.id, taskId: firstTaskId!, sequence: iteration }
      );
      if (iteration >= WARM_UP_SAMPLES) remoteSamples.push(duration);
    }

    const dragStartSamples: number[] = [];
    const dragEndSamples: number[] = [];
    const reorderDispatchSamples: number[] = [];
    const reorderResponseSamples: number[] = [];
    const reorderHttpSamples: number[] = [];
    const reorderPayloadBytes: number[] = [];
    for (let iteration = 0; iteration < WARM_UP_SAMPLES + MEASURED_SAMPLES; iteration += 1) {
      const source = page.locator('[data-kanban-dropzone="Backlog"] [data-kanban-task-card]').first();
      await source.focus();
      const start = await page.evaluate(() => performance.now());
      await page.keyboard.press("Space");
      await expect(source).toHaveCSS("position", "fixed");
      const lifted = await page.evaluate(() => performance.now());
      await page.keyboard.press("ArrowDown");
      const requestPromise = page.waitForRequest((request) =>
        request.url().endsWith(`/projects/${project.id}/tasks/reorder`) &&
        request.method() === "POST"
      );
      const responsePromise = page.waitForResponse((response) =>
        response.url().endsWith(`/projects/${project.id}/tasks/reorder`) &&
        response.request().method() === "POST"
      );
      const drop = await page.evaluate(() => performance.now());
      await page.keyboard.press("Space");
      const request = await requestPromise;
      const dispatched = await page.evaluate(() => performance.now());
      const response = await responsePromise;
      await response.finished();
      expect(response.ok()).toBeTruthy();
      const persisted = await page.evaluate(() => performance.now());
      await expect(source).not.toHaveCSS("position", "fixed");
      const dropped = await page.evaluate(() => performance.now());
      if (iteration >= WARM_UP_SAMPLES) {
        dragStartSamples.push(lifted - start);
        dragEndSamples.push(dropped - drop);
        reorderDispatchSamples.push(dispatched - drop);
        reorderResponseSamples.push(persisted - drop);
        reorderHttpSamples.push(request.timing().responseEnd);
        reorderPayloadBytes.push(request.postDataBuffer()?.byteLength ?? 0);
      }
    }

    const controlLoadSamples: number[] = [];
    const controlModalSamples: number[] = [];
    const controlDragStartSamples: number[] = [];
    const controlDragEndSamples: number[] = [];
    const controlRoute = `/projects/${controlProject.id}#kanban`;
    for (let iteration = 0; iteration < 7; iteration += 1) {
      if (iteration === 0) {
        await page.goto(controlRoute, { waitUntil: "domcontentloaded" });
      } else {
        await page.reload({ waitUntil: "domcontentloaded" });
      }
      await expect(page.locator("[data-kanban-task-card]")).toHaveCount(12);
      const elapsed = await page.evaluate(() => performance.now());
      if (iteration >= 2) controlLoadSamples.push(elapsed);
    }
    const controlDomElements = await page.evaluate(() => document.querySelectorAll("*").length);
    const controlCard = page.locator("[data-kanban-task-card]").first();
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const started = await page.evaluate(() => performance.now());
      await controlCard.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const elapsed = (await page.evaluate(() => performance.now())) - started;
      await page.getByRole("button", { name: "Close task" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      if (iteration >= 2) controlModalSamples.push(elapsed);
    }
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const source = page.locator('[data-kanban-dropzone="Backlog"] [data-kanban-task-card]').first();
      await source.focus();
      const start = await page.evaluate(() => performance.now());
      await page.keyboard.press("Space");
      await expect(source).toHaveCSS("position", "fixed");
      const lifted = await page.evaluate(() => performance.now());
      await page.keyboard.press("ArrowDown");
      const responsePromise = page.waitForResponse((response) =>
        response.url().endsWith(`/projects/${controlProject.id}/tasks/reorder`) &&
        response.request().method() === "POST"
      );
      const drop = await page.evaluate(() => performance.now());
      await page.keyboard.press("Space");
      await expect(source).not.toHaveCSS("position", "fixed");
      const dropped = await page.evaluate(() => performance.now());
      expect((await responsePromise).ok()).toBeTruthy();
      if (iteration >= 2) {
        controlDragStartSamples.push(lifted - start);
        controlDragEndSamples.push(dropped - drop);
      }
    }

    const results = {
      fixture: { activeTasks: ACTIVE_TASKS, archivedTasks: ARCHIVED_TASKS, controlTasks: 12 },
      environment: {
        node: process.version,
        cpu: os.cpus()[0]?.model,
        platform: process.platform,
      },
      metricsMs: {
        navigationToCards: summary(loadSamples),
        modalOpen: summary(modalSamples),
        remoteCommentApplyToFrame: summary(remoteSamples),
        dragLift: summary(dragStartSamples),
        dragDrop: summary(dragEndSamples),
        reorderDispatch: summary(reorderDispatchSamples),
        reorderResponse: summary(reorderResponseSamples),
        reorderHttp: summary(reorderHttpSamples),
        controlNavigationToCards: summary(controlLoadSamples),
        controlModalOpen: summary(controlModalSamples),
        controlDragLift: summary(controlDragStartSamples),
        controlDragDrop: summary(controlDragEndSamples),
      },
      htmlBytes: summary(responseBytes),
      reorderPayloadBytes: summary(reorderPayloadBytes),
      domElements: { large: largeDomElements, control: controlDomElements },
      rawSamplesMs: {
        dragDrop: dragEndSamples,
        controlDragDrop: controlDragEndSamples,
      },
    };
    const output = path.join(process.cwd(), ".tmp", process.env.ND_KANBAN_AUDIT_OUTPUT || "nd-430-kanban-baseline.json");
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.project.delete({ where: { id: controlProject.id } });
  }
});
