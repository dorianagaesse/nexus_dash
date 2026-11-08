import { loadAllowedRelatedTasks, loadTaskRelationDiagnostic } from "./task-command-data";
import { normalizeRelatedTaskIds } from "@/lib/task-related";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import type { DbClient } from "@/lib/services/rls-context";
import type { ServiceErrorResult, ServiceResult } from "./task-types";
import { createError } from "./task-result";
import { normalizeText } from "./task-input";

export async function validateRelatedTaskIds(input: {
  db: DbClient;
  projectId: string;
  taskId?: string;
  relatedTaskIds: string[];
  allowArchivedTaskIds?: string[];
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ relatedTaskIds: string[] }>> {
  const filteredRelatedTaskIds = normalizeRelatedTaskIds(input.relatedTaskIds);
  const allowedArchivedTaskIds = new Set(
    normalizeRelatedTaskIds(input.allowArchivedTaskIds ?? [])
  );

  if (input.taskId && filteredRelatedTaskIds.includes(input.taskId)) {
    return createError(400, "related-tasks-invalid", {
      id: input.taskId,
      reason: "self",
    });
  }

  if (filteredRelatedTaskIds.length === 0) {
    return {
      ok: true,
      data: {
        relatedTaskIds: [],
      },
    };
  }

  const relatedTasks = await loadAllowedRelatedTasks(input.db, {
    projectId: input.projectId,
    taskIds: filteredRelatedTaskIds,
    allowedArchivedTaskIds: Array.from(allowedArchivedTaskIds),
  });

  if (relatedTasks.length !== filteredRelatedTaskIds.length) {
    const foundIds = new Set(relatedTasks.map((task) => task.id));
    const failingId = filteredRelatedTaskIds.find((id) => !foundIds.has(id));
    if (!failingId) {
      return createError(400, "related-tasks-invalid");
    }
    // A project-bound agent must not learn whether an id exists elsewhere,
    // even when its human owner can see that other project through RLS.
    const candidate = await loadTaskRelationDiagnostic(
      input.db, failingId, input.agentAccess ? input.projectId : undefined
    );
    const reason = !candidate
      ? "missing"
      : candidate.projectId !== input.projectId
        ? "cross-project"
        : candidate.archivedAt
          ? "archived"
          : "missing";
    return createError(400, "related-tasks-invalid", { id: failingId, reason });
  }

  return {
    ok: true,
    data: {
      relatedTaskIds: filteredRelatedTaskIds,
    },
  };
}

export async function validateEpicId(input: {
  db: DbClient;
  projectId: string;
  epicId: string | null;
}): Promise<ServiceResult<{ epicId: string | null }>> {
  const epicId = normalizeText(input.epicId);
  if (!epicId) {
    return {
      ok: true,
      data: {
        epicId: null,
      },
    };
  }

  const epic = await input.db.epic.findFirst({
    where: {
      id: epicId,
      projectId: input.projectId,
    },
    select: {
      id: true,
    },
  });

  if (!epic) {
    return createError(400, "epic-invalid");
  }

  return {
    ok: true,
    data: {
      epicId,
    },
  };
}

// Read the calling credential live; existing bearer tokens do not cache this permission.
export async function requireAgentDoneMoveCapability(
  db: DbClient,
  projectId: string,
  agentAccess?: AgentProjectAccessContext
): Promise<ServiceErrorResult | null> {
  if (!agentAccess) return null;
  if (agentAccess.sessionId && !agentAccess.canMoveTasksToDone) return createError(403, "agent-done-move-disabled");
  const credential = await db.apiCredential.findFirst({
    where: {
      id: agentAccess.credentialId,
      projectId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { canMoveTasksToDone: true },
  });
  if (!credential?.canMoveTasksToDone) {
    return createError(403, "agent-done-move-disabled");
  }
  return null;
}
