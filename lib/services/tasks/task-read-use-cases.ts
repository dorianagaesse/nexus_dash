import {
  requireAgentProjectScopes,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import {
  archiveStaleDoneTasks,
  listProjectKanbanTaskRecords,
  getProjectKanbanTaskRecord,
  type ProjectKanbanTaskRecord,
  type TaskListFilters,
} from "./task-data";
import { normalizeText } from "./task-input";
import { createError } from "./task-result";
import type { ServiceResult } from "./task-types";

export type { TaskListAssigneeFilter, TaskListFilters } from "./task-data";

export async function listProjectKanbanTasks(
  projectId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext,
  filters?: TaskListFilters
): Promise<ProjectKanbanTaskRecord[]> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return [];
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return [];
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    await archiveStaleDoneTasks(db, projectId, normalizedActorUserId);

    return listProjectKanbanTaskRecords(db, projectId, normalizedActorUserId, filters);
  });
}

export async function getProjectKanbanTaskById(
  projectId: string,
  taskId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceResult<{ task: ProjectKanbanTaskRecord }>> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const task = await getProjectKanbanTaskRecord(db, projectId, taskId, normalizedActorUserId);

    if (!task) {
      return createError(404, "Task not found");
    }

    return { ok: true, data: { task } };
  });
}
