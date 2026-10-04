import type { ProjectActivityEventAction } from "@/lib/project-activity-event-types";
import { ARCHIVE_AFTER_MS } from "@/lib/archive-policy";
import {
  calculateEpicProgressPercent,
  deriveEpicStatus,
  mapEpicTaskSummary,
  type EpicLinkedTaskStatus,
  type EpicTaskSummary,
} from "@/lib/epic";
import { logServerError } from "@/lib/observability/logger";
import {
  hasProjectActorChanged,
  type ProjectActorReference,
  type ProjectActorSummary,
} from "@/lib/project-actor";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  buildProjectPrincipalWhere,
  hasRequiredRole,
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import {
  loadProjectActorRegistry,
  mapStoredProjectActor,
  resolveAssignableProjectActorFromRegistry,
  resolveProjectMutationActor,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { mapTaskAuthorRecord, type TaskAuthorSummary } from "@/lib/task-author";
import { taskPersonSummarySelect, type TaskPersonRecord } from "@/lib/task-person";
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
  lead: ProjectActorSummary | null;
  leadAssignedAt: Date | null;
  createdBy: TaskAuthorSummary;
  updatedBy: TaskAuthorSummary;
}

export interface ProjectEpicLeadChange {
  previous: ProjectActorSummary | null;
  next: ProjectActorSummary | null;
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

interface AssignProjectEpicLeadInput {
  actorUserId: string;
  projectId: string;
  epicId: string;
  lead: ProjectActorReference;
  agentAccess?: AgentProjectAccessContext;
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
  referenceNumber: true,
  title: true,
  status: true,
  archivedAt: true,
  position: true,
  createdAt: true,
} as const;

const epicProvenanceSelect = {
  leadKind: true,
  leadUserId: true,
  leadCredentialId: true,
  leadDisplayNameSnapshot: true,
  leadAssignedAt: true,
  createdByCredentialId: true,
  createdByCredentialLabel: true,
  updatedByCredentialId: true,
  updatedByCredentialLabel: true,
  createdByUser: {
    select: taskPersonSummarySelect,
  },
  updatedByUser: {
    select: taskPersonSummarySelect,
  },
} as const;

interface EpicProvenanceRecord {
  leadKind: "human" | "agent" | null;
  leadUserId: string | null;
  leadCredentialId: string | null;
  leadDisplayNameSnapshot: string | null;
  leadAssignedAt: Date | null;
  createdByCredentialId: string | null;
  createdByCredentialLabel: string | null;
  updatedByCredentialId: string | null;
  updatedByCredentialLabel: string | null;
  createdByUser: TaskPersonRecord;
  updatedByUser: TaskPersonRecord;
}

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

function mapStoredEpicActor(input: {
  kind: "human" | "agent";
  id: string | null;
  displayNameSnapshot: string | null;
  registry: ProjectActorRegistry | null;
}): ProjectActorSummary | null {
  // Registry summaries stay authoritative so members without ApiCredential
  // read access still see live agent status instead of a revoked fallback.
  const projectedActor = input.id
    ? input.kind === "human"
      ? input.registry?.humanById.get(input.id)
      : input.registry?.credentialById.get(input.id)
    : null;
  if (projectedActor) {
    return projectedActor;
  }

  return mapStoredProjectActor(
    {
      kind: input.kind,
      id: input.id,
      displayNameSnapshot: input.displayNameSnapshot,
      isCurrentProjectHuman: Boolean(
        input.id && input.registry?.activeHumanIds.has(input.id)
      ),
    },
    "epic-lead-human-identity-invalid"
  );
}

function mapEpicLead(
  epic: Pick<
    EpicProvenanceRecord,
    "leadKind" | "leadUserId" | "leadCredentialId" | "leadDisplayNameSnapshot"
  >,
  registry: ProjectActorRegistry | null
): ProjectActorSummary | null {
  if (!epic.leadKind) {
    return null;
  }

  return mapStoredEpicActor({
    kind: epic.leadKind,
    id: epic.leadKind === "human" ? epic.leadUserId : epic.leadCredentialId,
    displayNameSnapshot: epic.leadDisplayNameSnapshot,
    registry,
  });
}

function mapProjectEpicSummary(
  epic: {
    id: string;
    name: string;
    description: string;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tasks: Array<{
      id: string;
      referenceNumber: number;
      title: string;
      status: string;
      archivedAt: Date | null;
      position?: number;
      createdAt?: Date;
    }>;
  } & EpicProvenanceRecord,
  registry: ProjectActorRegistry | null
): ProjectEpicSummary {
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
    lead: mapEpicLead(epic, registry),
    leadAssignedAt: epic.leadAssignedAt,
    createdBy: mapTaskAuthorRecord({
      author: epic.createdByUser,
      agentCredentialId: epic.createdByCredentialId,
      agentCredentialLabel: epic.createdByCredentialLabel,
    }),
    updatedBy: mapTaskAuthorRecord({
      author: epic.updatedByUser,
      agentCredentialId: epic.updatedByCredentialId,
      agentCredentialLabel: epic.updatedByCredentialLabel,
    }),
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
  registry: ProjectActorRegistry | null;
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
      ...epicProvenanceSelect,
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        select: epicTaskSelect,
      },
    },
  });

  return epic ? mapProjectEpicSummary(epic, input.registry) : null;
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

    const [epics, registry] = await Promise.all([
      db.epic.findMany({
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
          ...epicProvenanceSelect,
          tasks: {
            orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
            select: epicTaskSelect,
          },
        },
      }),
      loadProjectActorRegistry({ db, projectId }),
    ]);

    return epics.map((epic) => mapProjectEpicSummary(epic, registry));
  }) as Promise<ProjectEpicSummary[]>;
}

export async function createProjectEpic(
  input: CreateProjectEpicInput
): Promise<
  ServiceResult<{ epic: ProjectEpicSummary; actor: ProjectActorSummary }>
> {
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

    const mutationActor = await resolveProjectMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
    }

    const assignedAt = new Date();
    const agentAttribution = {
      credentialId: mutationActor.actor.credentialId,
      credentialLabel: mutationActor.actor.credentialId
        ? mutationActor.actor.displayNameSnapshot
        : null,
    };
    const leadActor = {
      leadKind: mutationActor.actor.summary.kind,
      leadUserId: mutationActor.actor.userId,
      leadCredentialId: mutationActor.actor.credentialId,
      leadDisplayNameSnapshot: mutationActor.actor.displayNameSnapshot,
    };

    try {
      const createdEpic = await db.epic.create({
        data: {
          projectId: input.projectId,
          name,
          description,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          createdByCredentialId: agentAttribution.credentialId,
          createdByCredentialLabel: agentAttribution.credentialLabel,
          updatedByCredentialId: agentAttribution.credentialId,
          updatedByCredentialLabel: agentAttribution.credentialLabel,
          // New epics start with their creating actor as the accountable lead.
          ...leadActor,
          leadAssignedByKind: mutationActor.actor.summary.kind,
          leadAssignedByUserId: mutationActor.actor.userId,
          leadAssignedByCredentialId: mutationActor.actor.credentialId,
          leadAssignedByDisplayNameSnapshot:
            mutationActor.actor.displayNameSnapshot,
          leadAssignedAt: assignedAt,
        },
        select: {
          id: true,
        },
      });

      const registry = await loadProjectActorRegistry({
        db,
        projectId: input.projectId,
      });
      const epic = await readEpicSummaryById({
        db,
        epicId: createdEpic.id,
        projectId: input.projectId,
        registry,
      });
      if (!epic) {
        return createError(500, "epic-create-failed");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: {
          epic,
          actor: mutationActor.actor.summary,
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
): Promise<
  ServiceResult<{
    epic: ProjectEpicSummary;
    actor: ProjectActorSummary;
  }>
> {
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

    const mutationActor = await resolveProjectMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
    }

    const registry = await loadProjectActorRegistry({
      db,
      projectId: input.projectId,
    });

    try {
      await db.epic.update({
        where: {
          id: epicId,
        },
        data: {
          name,
          description,
          updatedByUserId: actorUserId,
          updatedByCredentialId: mutationActor.actor.credentialId,
          updatedByCredentialLabel: mutationActor.actor.credentialId
            ? mutationActor.actor.displayNameSnapshot
            : null,
        },
      });

      const epic = await readEpicSummaryById({
        db,
        epicId,
        projectId: input.projectId,
        registry,
      });
      if (!epic) {
        return createError(404, "epic-not-found");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: {
          epic,
          actor: mutationActor.actor.summary,
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

// Lead changes go through their own endpoint so a stale client can never
// clobber concurrently edited name/description fields.
export async function assignProjectEpicLead(
  input: AssignProjectEpicLeadInput
): Promise<
  ServiceResult<{
    epic: ProjectEpicSummary;
    leadChange: ProjectEpicLeadChange | null;
    actor: ProjectActorSummary;
  }>
> {
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
        leadKind: true,
        leadUserId: true,
        leadCredentialId: true,
        leadDisplayNameSnapshot: true,
      },
    });
    if (!existingEpic) {
      return createError(404, "epic-not-found");
    }

    const mutationActor = await resolveProjectMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
    }

    const registry = await loadProjectActorRegistry({
      db,
      projectId: input.projectId,
    });

    const leadResolution = resolveAssignableProjectActorFromRegistry({
      registry,
      reference: input.lead,
      assigneeInvalidError: "epic-lead-invalid",
    });
    if (!leadResolution.ok) {
      return createError(leadResolution.status, leadResolution.error);
    }

    const previousLead = mapEpicLead(existingEpic, registry);
    const didLeadChange = hasProjectActorChanged(
      previousLead,
      leadResolution.actor.summary
    );

    try {
      if (didLeadChange) {
        await db.epic.update({
          where: {
            id: epicId,
          },
          data: {
            leadKind: leadResolution.actor.summary.kind,
            leadUserId: leadResolution.actor.userId,
            leadCredentialId: leadResolution.actor.credentialId,
            leadDisplayNameSnapshot: leadResolution.actor.displayNameSnapshot,
            leadAssignedByKind: mutationActor.actor.summary.kind,
            leadAssignedByUserId: mutationActor.actor.userId,
            leadAssignedByCredentialId: mutationActor.actor.credentialId,
            leadAssignedByDisplayNameSnapshot:
              mutationActor.actor.displayNameSnapshot,
            leadAssignedAt: new Date(),
            updatedByUserId: actorUserId,
            updatedByCredentialId: mutationActor.actor.credentialId,
            updatedByCredentialLabel: mutationActor.actor.credentialId
              ? mutationActor.actor.displayNameSnapshot
              : null,
          },
        });
      }

      const epic = await readEpicSummaryById({
        db,
        epicId,
        projectId: input.projectId,
        registry,
      });
      if (!epic) {
        return createError(404, "epic-not-found");
      }

      if (didLeadChange) {
        await touchProjectActivity({ db, projectId: input.projectId });
      }

      return {
        ok: true,
        data: {
          epic,
          leadChange: didLeadChange
            ? {
                previous: previousLead,
                next: leadResolution.actor.summary,
              }
            : null,
          actor: mutationActor.actor.summary,
        },
      };
    } catch (error) {
      logServerError("assignProjectEpicLead", error);
      return createError(500, "epic-lead-update-failed");
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
): Promise<
  ServiceResult<{
    epic: ProjectEpicSummary;
    actor: ProjectActorSummary;
    changed: boolean;
  }>
> {
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

    const mutationActor = await resolveProjectMutationActor({
      db,
      actorUserId,
      projectId: input.projectId,
      agentAccess: input.agentAccess,
    });
    if (!mutationActor.ok) {
      return createError(mutationActor.status, mutationActor.error);
    }

    try {
      const isAlreadyInTargetState = input.archivedAt
        ? existingEpic.archivedAt != null
        : existingEpic.archivedAt == null;

      const updatedByData = {
        updatedByUserId: actorUserId,
        updatedByCredentialId: mutationActor.actor.credentialId,
        updatedByCredentialLabel: mutationActor.actor.credentialId
          ? mutationActor.actor.displayNameSnapshot
          : null,
      };

      if (!isAlreadyInTargetState) {
        await db.epic.update({
          where: {
            id: epicId,
          },
          data: input.archivedAt
            ? {
                archivedAt: input.archivedAt,
                ...updatedByData,
              }
            : {
                archivedAt: null,
                // Restoring is durable: the stale sweep keeps this epic active
                // until it completes again (a newer completion moment).
                autoArchiveExemptAt: new Date(),
                ...updatedByData,
              },
        });
      }

      const registry = await loadProjectActorRegistry({
        db,
        projectId: input.projectId,
      });
      const epic = await readEpicSummaryById({
        db,
        epicId,
        projectId: input.projectId,
        registry,
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
          actor: mutationActor.actor.summary,
          changed: !isAlreadyInTargetState,
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
): Promise<
  ServiceResult<{
    epic: ProjectEpicSummary;
    actor: ProjectActorSummary;
    changed: boolean;
  }>
> {
  return setProjectEpicArchivedAt({
    ...input,
    archivedAt: new Date(),
  });
}

export async function unarchiveProjectEpic(
  input: EpicMutationInput
): Promise<
  ServiceResult<{
    epic: ProjectEpicSummary;
    actor: ProjectActorSummary;
    changed: boolean;
  }>
> {
  return setProjectEpicArchivedAt({
    ...input,
    archivedAt: null,
  });
}

export const PROJECT_EPIC_HISTORY_DEFAULT_LIMIT = 20;
const PROJECT_EPIC_HISTORY_MAX_LIMIT = 50;

export interface ProjectEpicHistoryActorRef {
  kind: "human" | "agent";
  id: string;
  displayName: string;
}

export interface ProjectEpicHistoryEntry {
  id: string;
  action: ProjectActivityEventAction;
  actor: ProjectActorSummary | null;
  version: Date;
  operation: "archived" | "restored" | null;
  leadChange: {
    previous: ProjectEpicHistoryActorRef | null;
    next: ProjectEpicHistoryActorRef | null;
  } | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseEpicHistoryActorRef(
  value: unknown
): ProjectEpicHistoryActorRef | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const { kind, id, displayName } = record;
  if (
    (kind !== "human" && kind !== "agent") ||
    typeof id !== "string" ||
    !id.trim() ||
    typeof displayName !== "string" ||
    !displayName.trim()
  ) {
    return null;
  }

  return { kind, id: id.trim(), displayName: displayName.trim() };
}

function parseEpicHistoryLeadChange(
  payload: unknown
): ProjectEpicHistoryEntry["leadChange"] {
  const payloadRecord = asRecord(payload);
  const leadChange = asRecord(payloadRecord?.leadChange);
  if (!leadChange) {
    return null;
  }

  const rawPrevious = leadChange.previous;
  const rawNext = leadChange.next;
  const previous =
    rawPrevious === null ? null : parseEpicHistoryActorRef(rawPrevious);
  const next = rawNext === null ? null : parseEpicHistoryActorRef(rawNext);
  if (
    (rawPrevious !== null && !previous) ||
    (rawNext !== null && !next) ||
    (!previous && !next)
  ) {
    return null;
  }

  return { previous, next };
}

function parseEpicHistoryOperation(
  payload: unknown
): ProjectEpicHistoryEntry["operation"] {
  const operation = asRecord(payload)?.operation;
  return operation === "archived" || operation === "restored"
    ? operation
    : null;
}

function mapEpicHistoryActor(input: {
  actorUserId: string | null;
  payload: unknown;
  registry: ProjectActorRegistry | null;
}): ProjectActorSummary | null {
  const payloadActor = parseEpicHistoryActorRef(asRecord(input.payload)?.actor);
  if (payloadActor) {
    return mapStoredEpicActor({
      kind: payloadActor.kind,
      id: payloadActor.id,
      displayNameSnapshot: payloadActor.displayName,
      registry: input.registry,
    });
  }

  const actorUserId = input.actorUserId?.trim() ?? "";
  if (!actorUserId) {
    return null;
  }

  const projectedActor = input.registry?.humanById.get(actorUserId);
  if (projectedActor) {
    return projectedActor;
  }

  return mapStoredEpicActor({
    kind: "human",
    id: actorUserId,
    displayNameSnapshot: null,
    registry: input.registry,
  });
}

export async function listProjectEpicHistory(input: {
  actorUserId: string;
  projectId: string;
  epicId: string;
  agentAccess?: AgentProjectAccessContext;
  take?: number;
}): Promise<ServiceResult<{ entries: ProjectEpicHistoryEntry[] }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const epicId = normalizeText(input.epicId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!epicId) {
    return createError(404, "epic-not-found");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:read"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const take = Math.min(
    Math.max(input.take ?? PROJECT_EPIC_HISTORY_DEFAULT_LIMIT, 1),
    PROJECT_EPIC_HISTORY_MAX_LIMIT
  );

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const epic = await db.epic.findFirst({
      where: {
        id: epicId,
        projectId: input.projectId,
      },
      select: {
        id: true,
      },
    });
    if (!epic) {
      return createError(404, "epic-not-found");
    }

    const [events, registry] = await Promise.all([
      db.projectActivityEvent.findMany({
        where: {
          projectId: input.projectId,
          domain: "epic",
          entityId: epicId,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          actorUserId: true,
          action: true,
          version: true,
          payload: true,
        },
      }),
      loadProjectActorRegistry({ db, projectId: input.projectId }),
    ]);

    return {
      ok: true,
      data: {
        entries: events.map((event) => ({
          id: event.id,
          action: event.action as ProjectActivityEventAction,
          actor: mapEpicHistoryActor({
            actorUserId: event.actorUserId,
            payload: event.payload,
            registry,
          }),
          version: event.version,
          operation: parseEpicHistoryOperation(event.payload),
          leadChange: parseEpicHistoryLeadChange(event.payload),
        })),
      },
    };
  });
}
