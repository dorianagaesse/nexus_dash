import {
  calculateEpicProgressPercent,
  deriveEpicStatus,
  mapEpicTaskSummary,
  type EpicLinkedTaskStatus,
  type EpicTaskSummary,
} from "@/lib/epic";
import { logServerError } from "@/lib/observability/logger";
import {
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

const epicTaskSelect = {
  id: true,
  title: true,
  status: true,
  archivedAt: true,
  position: true,
  createdAt: true,
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
    linkedTasks,
    createdAt: epic.createdAt,
    updatedAt: epic.updatedAt,
  };
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
  agentAccess?: AgentProjectAccessContext
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

    const epics = await db.epic.findMany({
      where: {
        projectId,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
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
