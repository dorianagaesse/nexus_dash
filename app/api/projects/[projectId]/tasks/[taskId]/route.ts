import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import { normalizeTaskLabels, serializeTaskLabels } from "@/lib/task-label";

const MIN_TITLE_LENGTH = 2;

interface UpdateTaskPayload {
  title?: string;
  label?: string;
  labels?: string[];
  description?: string;
  blockedFollowUpEntry?: string;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const { projectId, taskId } = params;

  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: UpdateTaskPayload;

  try {
    payload = (await request.json()) as UpdateTaskPayload;
  } catch (error) {
    console.error("[PATCH /api/projects/:projectId/tasks/:taskId] invalid json", error);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const title = normalizeText(payload.title);
  const rawLabels =
    Array.isArray(payload.labels) && payload.labels.length > 0
      ? payload.labels
      : [normalizeText(payload.label)];
  const labels = normalizeTaskLabels(rawLabels.map((entry) => normalizeText(entry)));
  const serializedLabels = serializeTaskLabels(labels);
  const description = sanitizeRichText(normalizeText(payload.description));
  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);

  if (title.length < MIN_TITLE_LENGTH) {
    return NextResponse.json(
      { error: "Task title must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, status: true, position: true },
    });

    if (!existingTask || existingTask.projectId !== projectId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title,
          label: labels[0] ?? null,
          labelsJson: serializedLabels,
          description,
        },
      });

      if (blockedFollowUpEntry.length > 0 && existingTask.status === "Blocked") {
        await tx.taskBlockedFollowUp.create({
          data: {
            taskId,
            content: blockedFollowUpEntry,
          },
        });
      }

      return tx.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          label: true,
          labelsJson: true,
          description: true,
          blockedNote: true,
          status: true,
          position: true,
          blockedFollowUps: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              content: true,
              createdAt: true,
            },
          },
        },
      });
    });

    if (!updatedTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("[PATCH /api/projects/:projectId/tasks/:taskId]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
