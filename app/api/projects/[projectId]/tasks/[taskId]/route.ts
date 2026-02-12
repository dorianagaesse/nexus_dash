import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";

const MIN_TITLE_LENGTH = 2;

interface UpdateTaskPayload {
  title?: string;
  label?: string;
  description?: string;
  blockedNote?: string;
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
  const label = normalizeText(payload.label);
  const description = sanitizeRichText(normalizeText(payload.description));
  const blockedNote = normalizeText(payload.blockedNote);

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

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        label: label.length > 0 ? label : null,
        description,
        blockedNote: blockedNote.length > 0 ? blockedNote : null,
      },
      select: {
        id: true,
        title: true,
        label: true,
        description: true,
        blockedNote: true,
        status: true,
        position: true,
      },
    });

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("[PATCH /api/projects/:projectId/tasks/:taskId]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
