import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  archiveTaskForProject,
  unarchiveTaskForProject,
} from "@/lib/services/project-task-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const { projectId, taskId } = params;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await archiveTaskForProject(projectId, taskId, authenticatedUser.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    archivedAt: result.data.archivedAt.toISOString(),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const { projectId, taskId } = params;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const result = await unarchiveTaskForProject(projectId, taskId, authenticatedUser.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
