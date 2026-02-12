import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

interface ReorderColumnPayload {
  status: string;
  taskIds: string[];
}

interface ReorderPayload {
  columns: ReorderColumnPayload[];
}

function isValidPayload(payload: unknown): payload is ReorderPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybeColumns = (payload as ReorderPayload).columns;

  if (!Array.isArray(maybeColumns)) {
    return false;
  }

  return maybeColumns.every((column) => {
    if (!column || typeof column !== "object") {
      return false;
    }

    if (typeof column.status !== "string" || !isTaskStatus(column.status)) {
      return false;
    }

    if (!Array.isArray(column.taskIds)) {
      return false;
    }

    return column.taskIds.every((id) => typeof id === "string" && id.length > 0);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const projectId = params.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    console.error("[POST /api/projects/:projectId/tasks/reorder] invalid json", error);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedColumns = TASK_STATUSES.map((status) => {
    const matchingColumn = body.columns.find((column) => column.status === status);
    return {
      status,
      taskIds: matchingColumn ? matchingColumn.taskIds : [],
    };
  });

  const taskIds = normalizedColumns.flatMap((column) => column.taskIds);

  if (taskIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        id: { in: taskIds },
      },
      select: { id: true },
    });

    if (tasks.length !== taskIds.length) {
      return NextResponse.json(
        { error: "One or more tasks do not belong to this project" },
        { status: 400 }
      );
    }

    const updateOperations = normalizedColumns.flatMap(
      (column: { status: TaskStatus; taskIds: string[] }) =>
        column.taskIds.map((taskId, index) =>
          prisma.task.update({
            where: { id: taskId },
            data: {
              status: column.status,
              position: index,
            },
          })
        )
    );

    await prisma.$transaction(updateOperations);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/projects/:projectId/tasks/reorder]", error);
    return NextResponse.json(
      { error: "Failed to persist task order" },
      { status: 500 }
    );
  }
}
