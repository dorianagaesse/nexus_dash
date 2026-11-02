import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";

// Opt-in real-PostgreSQL comparison; ordinary unit runs never need a database.
test.skipIf(process.env.ND545_PERFORMANCE !== "1")("measure actor-scoped Task reads and writes", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { getRealtimeMetricsSnapshot } = await import("@/lib/observability/realtime-metrics");
  const { listProjectKanbanTasks } = await import("@/lib/services/project-service");
  const { reorderProjectTasks, updateTaskForProject } = await import("@/lib/services/project-task-service");
  const user = await prisma.user.create({ data: { name: "Task data measurement" } });
  const project = await prisma.project.create({ data: { ownerId: user.id, name: "ND-545 measurement" } });
  const samples: Record<string, Array<{ queries: number; ms: number }>> = {};
  try {
    await prisma.task.createMany({ data: Array.from({ length: 24 }, (_, position) => ({
      title: `Measurement task ${position}`, projectId: project.id, position,
      createdByUserId: user.id, updatedByUserId: user.id,
    })) });
    const tasks = await listProjectKanbanTasks(project.id, user.id);
    expect(tasks).toHaveLength(24);
    for (let iteration = 0; iteration < 13; iteration++) {
      const operations = {
        board: async () => { expect(await listProjectKanbanTasks(project.id, user.id)).toHaveLength(24); },
        update: async () => { expect((await updateTaskForProject(project.id, tasks[0].id, { title: `Changed title ${iteration}` }, user.id)).ok).toBe(true); },
        reorder: async () => { expect((await reorderProjectTasks(project.id, { columns: [
          { status: "Backlog", taskIds: (iteration % 2 ? tasks : [...tasks].reverse()).map(task => task.id) },
          { status: "In Progress", taskIds: [] }, { status: "Blocked", taskIds: [] }, { status: "Done", taskIds: [] },
        ] }, user.id)).ok).toBe(true); },
      };
      for (const [name, operation] of Object.entries(operations)) {
        const before = getRealtimeMetricsSnapshot().database.queryCalls;
        const start = performance.now();
        await operation();
        const sample = { queries: getRealtimeMetricsSnapshot().database.queryCalls - before, ms: performance.now() - start };
        if (iteration >= 3) (samples[name] ??= []).push(sample);
      }
    }
    const report = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
      const latencies = values.map(value => value.ms).sort((a, b) => a - b);
      return [name, { samples: values.length, queryCounts: [...new Set(values.map(value => value.queries))], medianMs: latencies[Math.floor(latencies.length / 2)], p95Ms: latencies[Math.ceil(latencies.length * .95) - 1] }];
    }));
    if (process.env.ND545_REPORT_PATH) writeFileSync(process.env.ND545_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}, 120_000);
