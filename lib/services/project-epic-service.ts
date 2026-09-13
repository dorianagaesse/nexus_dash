import { ARCHIVE_AFTER_MS } from "@/lib/archive-policy";
import {
  calculateEpicProgressPercent,
  deriveEpicStatus,
  mapEpicTaskSummary,
  type EpicLinkedTaskStatus,
  type EpicTaskSummary,
} from "@/lib/epic";
import { logServerError } from "@/lib/observability/logger";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  buildProjectPrincipalWhere,
  hasRequiredRole,
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { type TaskStatus } from "@/lib/task-status";

const MIN_EPIC_NAME_LENGTH = 2;
const MIN_EPIC_DESCRIPTION_LENGTH = 2;

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export interface ProjectEpicSummary {
  id: string;
  name: string;
  description: string;
  status: "Ready" | "In progress" | "Completed";
  progressPercent: number;
  taskCount: number;
  completedTaskCount: number;
  archivedAt: Date | null;
  linkedTasks: EpicTaskSummary[];
  createdAt: Date;
  updatedAt: Date;
}

interface CreateProjectEpicInput {
  actorUserId: string;
  projectId: string;
  name: string;
  description: string;
  agentAccess?: AgentProjectAccessContext;
}

interface UpdateProjectEpicInput extends CreateProjectEpicInput {
  epicId: string;
}

interface EpicMutationInput {
  actorUserId: string;
  projectId: string;
  epicId: string;
  agentAccess?: AgentProjectAccessContext;
}

export interface ListProjectEpicsOptions {
  includeArchived?: boolean;
}

const epicTaskSelect = {
  id: true,
  title: true,
  status: true,
  archivedAt: true,
  position: true,
  createdAt: true,
} as const;

interface EpicCompletionTask {
  status: string;
  archivedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

const epicCompletionTaskSelect = {
  status: true,
  archivedAt: true,
  completedAt: true,
  updatedAt: true,
} as const;

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isPrismaUniqueError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

function mapProjectEpicSummary(epic: {
  id: string;
  name: string;
  description: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    archivedAt: Date | null;
    position?: number;
    createdAt?: Date;
  }>;
}): ProjectEpicSummary {
  const epicTasks = epic.tasks.map((task) => ({
    status: task.status as TaskStatus,
    archivedAt: task.archivedAt,
  })) satisfies EpicLinkedTaskStatus[];
  const linkedTasks = epic.tasks
    .slice()
    .sort((left, right) => {
      if (typeof left.position === "number" && typeof right.position === "number") {
        if (left.status === right.status && left.position !== right.position) {
          return left.position - right.position;
        }
      }

      if (left.status !== right.status) {
        return left.status.localeCompare(right.status);
      }

      if (left.createdAt && right.createdAt) {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }

      return left.title.localeCompare(right.title);
    })
    .map((task) => mapEpicTaskSummary(task));
  const completedTaskCount = epic.tasks.filter(
    (task) => task.archivedAt != null || task.status === "Done"
  ).length;

  return {
    id: epic.id,
    name: epic.name,
    description: epic.description,
    status: deriveEpicStatus(epicTasks),
    progressPercent: calculateEpicProgressPercent(epicTasks),
    taskCount: epic.tasks.length,
    completedTaskCount,
    archivedAt: epic.archivedAt ?? null,
    linkedTasks,
    createdAt: epic.createdAt,
    updatedAt: epic.updatedAt,
  };
}

function resolveEpicCompletionTime(tasks: EpicCompletionTask[]): Date | null {
  if (tasks.length === 0) {
    return null;
  }

  const linkedTaskStatuses = tasks.map((task) => ({
    status: task.status as TaskStatus,
    archivedAt: task.archivedAt,
  })) satisfies EpicLinkedTaskStatus[];

  if (deriveEpicStatus(linkedTaskStatuses) !== "Completed") {
    return null;
  }

  return tasks.reduce<Date>((latest, task) => {
    const completedMoment = task.completedAt ?? task.archivedAt ?? task.updatedAt;
    return completedMoment.getTime() > latest.getTime() ? completedMoment : latest;
  }, new Date(0));
}

interface EpicCompletionCandidate {
  tasks: EpicCompletionTask[];
  autoArchiveExemptAt: Date | null;
}

function isStaleCompletedEpic(
  epic: EpicCompletionCandidate,
  archiveThreshold: Date
): boolean {
  const completedAt = resolveEpicCompletionTime(epic.tasks);
  if (completedAt === null || completedAt.getTime() > archiveThreshold.getTime()) {
    return false;
  }

  return (
    epic.autoArchiveExemptAt === null ||
    completedAt.getTime() > epic.autoArchiveExemptAt.getTime()
  );
}

async function archiveStaleCompletedEpics(input: {
  db: DbClient;
  projectId: string;
  actorUserId: string;
}): Promise<void> {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);
  const candidateEpics = await input.db.epic.findMany({
    where: {
      projectId: input.projectId,
      archivedAt: null,
      project: buildProjectPrincipalWhere(input.actorUserId),
    },
    select: {
      id: true,
      autoArchiveExemptAt: true,
      tasks: {
        select: epicCompletionTaskSelect,
      },
    },
  });

  const staleEpicIds = candidateEpics
    .filter((epic) => isStaleCompletedEpic(epic, archiveThreshold))
    .map((epic) => epic.id);

  if (staleEpicIds.length === 0) {
    return;
  }

  const archivedAt = new Date();
  const { count } = await input.db.epic.updateMany({
    where: {
      id: { in: staleEpicIds },
      archivedAt: null,
    },
    data: {
      archivedAt,
    },
  });

  if (count === 0) {
    return;
  }

  // Task reopenings can slip in between the candidate read and the update, and
  // updateMany cannot re-check relations, so verify what was just archived and
  // roll back any epic that is no longer stale.
  const archivedEpics = await input.db.epic.findMany({
    where: {
      id: { in: staleEpicIds },
      archivedAt,
    },
    select: {
      id: true,
      autoArchiveExemptAt: true,
      tasks: {
        select: epicCompletionTaskSelect,
      },
    },
  });

  const noLongerStaleEpicIds = archivedEpics
    .filter((epic) => !isStaleCompletedEpic(epic, archiveThreshold))
    .map((epic) => epic.id);

  if (noLongerStaleEpicIds.length === 0) {
    return;
  }

  await input.db.epic.updateMany({
    where: {
      id: { in: noLongerStaleEpicIds },
      archivedAt,
    },
    data: {
      archivedAt: null,
    },
  });
}

async function ensureUniqueEpicName(input: {
  db: DbClient;
  projectId: string;
  name: string;
  excludeEpicId?: string;
}): Promise<ServiceResult<true>> {
  const existingEpic = await input.db.epic.findFirst({
    where: {
      projectId: input.projectId,
      name: {
        equals: input.name,
        mode: "insensitive",
      },
      ...(input.excludeEpicId ? { id: { not: input.excludeEpicId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (existingEpic) {
    return createError(400, "epic-name-conflict");
  }

  return {
    ok: true,
    data: true,
  };
}

async function readEpicSummaryById(input: {
  db: DbClient;
  epicId: string;
  projectId: string;
}): Promise<ProjectEpicSummary | null> {
  const epic = await input.db.epic.findFirst({
    where: {
      id: input.epicId,
      projectId: input.projectId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        select: epicTaskSelect,
      },
    },
  });

  return epic ? mapProjectEpicSummary(epic) : null;
}

export async function listProjectEpics(
  projectId: string,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext,
  options?: ListProjectEpicsOptions
): Promise<ProjectEpicSummary[]> {
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
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return [];
    }

    // The sweep writes, and epic RLS only lets owners/editors write, so
    // viewers get the list without it.
    if (hasRequiredRole(access.role, "editor")) {
      await archiveStaleCompletedEpics({
        db,
        projectId,
        actorUserId: normalizedActorUserId,
      });
    }

    const epics = await db.epic.findMany({
      where: {
        projectId,
        ...(options?.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        tasks: {
          orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
          select: epicTaskSelect,
        },
      },
    });

    return epics.map((epic) => mapProjectEpicSummary(epic));
  }) as Promise<ProjectEpicSummary[]>;
}

export async function createProjectEpic(
  input: CreateProjectEpicInput
): Promise<ServiceResult<{ epic: ProjectEpicSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const name = normalizeText(input.name);
  const description = normalizeText(input.description);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (name.length < MIN_EPIC_NAME_LENGTH) {
    return createError(400, "epic-name-too-short");
  }
  if (description.length < MIN_EPIC_DESCRIPTION_LENGTH) {
    return createError(400, "epic-description-too-short");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const uniquenessCheck = await ensureUniqueEpicName({
      db,
      projectId: input.projectId,
      name,
    });
    if (!uniquenessCheck.ok) {
      return uniquenessCheck;
    }

    try {
      const createdEpic = await db.epic.create({
        data: {
          projectId: input.projectId,
          name,
          description,
        },
        select: {
          id: true,
        },
      });

      const epic = await readEpicSummaryById({
        db,
        epicId: createdEpic.id,
        projectId: input.projectId,
      });
      if (!epic) {
        return createError(500, "epic-create-failed");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: {
          epic,
        },
      };
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return createError(400, "epic-name-conflict");
      }

      logServerError("createProjectEpic", error);
      return createError(500, "epic-create-failed");
    }
  });
}

export async function updateProjectEpic(
  input: UpdateProjectEpicInput
): Promise<ServiceResult<{ epic: ProjectEpicSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const epicId = normalizeText(input.epicId);
  const name = normalizeText(input.name);
  const description = normalizeText(input.description);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!epicId) {
    return createError(400, "epic-not-found");
  }
  if (name.length < MIN_EPIC_NAME_LENGTH) {
    return createError(400, "epic-name-too-short");
  }
  if (description.length < MIN_EPIC_DESCRIPTION_LENGTH) {
    return createError(400, "epic-description-too-short");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingEpic = await db.epic.findFirst({
      where: {
        id: epicId,
        projectId: input.projectId,
      },
      select: {
        id: true,
      },
    });
    if (!existingEpic) {
      return createError(404, "epic-not-found");
    }

    const uniquenessCheck = await ensureUniqueEpicName({
      db,
      projectId: input.projectId,
      name,
      excludeEpicId: epicId,
    });
    if (!uniquenessCheck.ok) {
      return uniquenessCheck;
    }

    try {
      await db.epic.update({
        where: {
          id: epicId,
        },
        data: {
          name,
          description,
        },
      });

      const epic = await readEpicSummaryById({
        db,
        epicId,
        projectId: input.projectId,
      });
      if (!epic) {
        return createError(404, "epic-not-found");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: {
          epic,
        },
      };
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return createError(400, "epic-name-conflict");
      }

      logServerError("updateProjectEpic", error);
      return createError(500, "epic-update-failed");
    }
  });
}

export async function deleteProjectEpic(input: {
  actorUserId: string;
  projectId: string;
  epicId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const epicId = normalizeText(input.epicId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!epicId) {
    return createError(400, "epic-not-found");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingEpic = await db.epic.findFirst({
      where: {
        id: epicId,
        projectId: input.projectId,
      },
      select: {
        id: true,
      },
    });
    if (!existingEpic) {
      return createError(404, "epic-not-found");
    }

    try {
      await db.epic.delete({
        where: {
          id: epicId,
        },
      });

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: {
          ok: true,
        },
      };
    } catch (error) {
      logServerError("deleteProjectEpic", error);
      return createError(500, "epic-delete-failed");
    }
  });
}

async function setProjectEpicArchivedAt(
  input: EpicMutationInput & { archivedAt: Date | null }
): Promise<ServiceResult<{ epic: ProjectEpicSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const epicId = normalizeText(input.epicId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!epicId) {
    return createError(400, "epic-not-found");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const failureCode = input.archivedAt ? "epic-archive-failed" : "epic-restore-failed";

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingEpic = await db.epic.findFirst({
      where: {
        id: epicId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        archivedAt: true,
      },
    });
    if (!existingEpic) {
      return createError(404, "epic-not-found");
    }

    try {
      const isAlreadyInTargetState = input.archivedAt
        ? existingEpic.archivedAt != null
        : existingEpic.archivedAt == null;

      if (!isAlreadyInTargetState) {
        await db.epic.update({
          where: {
            id: epicId,
          },
          data: input.archivedAt
            ? {
                archivedAt: input.archivedAt,
              }
            : {
                archivedAt: null,
                // Restoring is durable: the stale sweep keeps this epic active
                // until it completes again (a newer completion moment).
                autoArchiveExemptAt: new Date(),
              },
        });
      }

      const epic = await readEpicSummaryById({
        db,
        epicId,
        projectId: input.projectId,
      });
      if (!epic) {
        return createError(404, "epic-not-found");
      }

      if (!isAlreadyInTargetState) {
        await touchProjectActivity({ db, projectId: input.projectId });
      }

      return {
        ok: true,
        data: {
          epic,
        },
      };
    } catch (error) {
      logServerError(input.archivedAt ? "archiveProjectEpic" : "unarchiveProjectEpic", error);
      return createError(500, failureCode);
    }
  });
}

export async function archiveProjectEpic(
  input: EpicMutationInput
): Promise<ServiceResult<{ epic: ProjectEpicSummary }>> {
  return setProjectEpicArchivedAt({
    ...input,
    archivedAt: new Date(),
  });
}

export async function unarchiveProjectEpic(
  input: EpicMutationInput
): Promise<ServiceResult<{ epic: ProjectEpicSummary }>> {
  return setProjectEpicArchivedAt({
    ...input,
    archivedAt: null,
  });
}
