import { logServerError } from "@/lib/observability/logger";
import {
  formatRoadmapTargetDate,
  isRoadmapMilestoneStatus,
  type ProjectRoadmapMilestone,
  type RoadmapMilestoneStatus,
} from "@/lib/roadmap-milestone";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import { parseTaskDeadlineDate } from "@/lib/task-deadline";

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 400;

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

interface CreateRoadmapMilestoneInput {
  actorUserId: string;
  projectId: string;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface UpdateRoadmapMilestoneInput {
  actorUserId: string;
  projectId: string;
  milestoneId: string;
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface ReorderRoadmapMilestonesInput {
  actorUserId: string;
  projectId: string;
  milestoneIds: string[];
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function parseRoadmapTargetDate(
  value: unknown
): ServiceResult<{ provided: boolean; targetDate: Date | null }> {
  if (value === undefined) {
    return {
      ok: true,
      data: {
        provided: false,
        targetDate: null,
      },
    };
  }

  if (value === null) {
    return {
      ok: true,
      data: {
        provided: true,
        targetDate: null,
      },
    };
  }

  if (typeof value !== "string") {
    return createError(400, "roadmap-target-date-invalid");
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      ok: true,
      data: {
        provided: true,
        targetDate: null,
      },
    };
  }

  const parsedDate = parseTaskDeadlineDate(normalizedValue);
  if (!parsedDate) {
    return createError(400, "roadmap-target-date-invalid");
  }

  return {
    ok: true,
    data: {
      provided: true,
      targetDate: parsedDate,
    },
  };
}

function parseRoadmapMilestoneStatus(
  value: unknown,
  options?: { fallback?: RoadmapMilestoneStatus }
): ServiceResult<{ provided: boolean; status: RoadmapMilestoneStatus }> {
  if (value === undefined || value === null) {
    return {
      ok: true,
      data: {
        provided: false,
        status: options?.fallback ?? "planned",
      },
    };
  }

  if (!isRoadmapMilestoneStatus(value)) {
    return createError(400, "roadmap-status-invalid");
  }

  return {
    ok: true,
    data: {
      provided: true,
      status: value,
    },
  };
}

function mapProjectRoadmapMilestone(record: {
  id: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: RoadmapMilestoneStatus;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRoadmapMilestone {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    targetDate: formatRoadmapTargetDate(record.targetDate),
    status: record.status,
    position: record.position,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function readRoadmapMilestoneById(input: {
  db: DbClient;
  projectId: string;
  milestoneId: string;
}): Promise<ProjectRoadmapMilestone | null> {
  const milestone = await input.db.roadmapMilestone.findFirst({
    where: {
      id: input.milestoneId,
      projectId: input.projectId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      targetDate: true,
      status: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return milestone ? mapProjectRoadmapMilestone(milestone) : null;
}

export function isValidRoadmapReorderPayload(
  payload: unknown
): payload is { milestoneIds: string[] } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const milestoneIds = (payload as { milestoneIds?: unknown }).milestoneIds;
  if (!Array.isArray(milestoneIds)) {
    return false;
  }

  const seenMilestoneIds = new Set<string>();
  return milestoneIds.every((milestoneId) => {
    if (typeof milestoneId !== "string" || milestoneId.trim().length === 0) {
      return false;
    }

    if (seenMilestoneIds.has(milestoneId)) {
      return false;
    }

    seenMilestoneIds.add(milestoneId);
    return true;
  });
}

export async function listProjectRoadmapMilestones(
  projectId: string,
  actorUserId: string
): Promise<ProjectRoadmapMilestone[]> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
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

    const milestones = await db.roadmapMilestone.findMany({
      where: {
        projectId,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        targetDate: true,
        status: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return milestones.map((milestone) => mapProjectRoadmapMilestone(milestone));
  }) as Promise<ProjectRoadmapMilestone[]>;
}

export async function createProjectRoadmapMilestone(
  input: CreateRoadmapMilestoneInput
): Promise<ServiceResult<{ milestone: ProjectRoadmapMilestone }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const title = normalizeText(input.title);
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);
  const statusInput = parseRoadmapMilestoneStatus(input.status);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-short");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-long");
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return createError(400, "roadmap-description-too-long");
  }
  if (!targetDateInput.ok) {
    return targetDateInput;
  }
  if (!statusInput.ok) {
    return statusInput;
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

    try {
      const maxPosition = await db.roadmapMilestone.aggregate({
        where: {
          projectId: input.projectId,
        },
        _max: {
          position: true,
        },
      });

      const createdMilestone = await db.roadmapMilestone.create({
        data: {
          projectId: input.projectId,
          title,
          description,
          targetDate: targetDateInput.data.targetDate,
          status: statusInput.data.status,
          position: (maxPosition._max.position ?? -1) + 1,
        },
        select: {
          id: true,
        },
      });

      const milestone = await readRoadmapMilestoneById({
        db,
        projectId: input.projectId,
        milestoneId: createdMilestone.id,
      });
      if (!milestone) {
        return createError(500, "roadmap-milestone-create-failed");
      }

      return {
        ok: true,
        data: {
          milestone,
        },
      };
    } catch (error) {
      logServerError("createProjectRoadmapMilestone", error, {
        actorUserId,
        projectId: input.projectId,
      });
      return createError(500, "roadmap-milestone-create-failed");
    }
  });
}

export async function updateProjectRoadmapMilestone(
  input: UpdateRoadmapMilestoneInput
): Promise<ServiceResult<{ milestone: ProjectRoadmapMilestone }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const milestoneId = normalizeText(input.milestoneId);
  const titleProvided = Object.prototype.hasOwnProperty.call(input, "title");
  const title = normalizeText(input.title);
  const descriptionProvided = Object.prototype.hasOwnProperty.call(input, "description");
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!milestoneId) {
    return createError(400, "roadmap-milestone-not-found");
  }
  if (titleProvided && title.length < MIN_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-short");
  }
  if (titleProvided && title.length > MAX_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-long");
  }
  if (descriptionProvided && description && description.length > MAX_DESCRIPTION_LENGTH) {
    return createError(400, "roadmap-description-too-long");
  }
  if (!targetDateInput.ok) {
    return targetDateInput;
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

    try {
      const existingMilestone = await db.roadmapMilestone.findFirst({
        where: {
          id: milestoneId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          status: true,
        },
      });
      if (!existingMilestone) {
        return createError(404, "roadmap-milestone-not-found");
      }

      const statusInput = parseRoadmapMilestoneStatus(input.status, {
        fallback: existingMilestone.status as RoadmapMilestoneStatus,
      });
      if (!statusInput.ok) {
        return statusInput;
      }

      await db.roadmapMilestone.update({
        where: {
          id: milestoneId,
        },
        data: {
          ...(titleProvided ? { title } : {}),
          ...(descriptionProvided ? { description } : {}),
          ...(targetDateInput.data.provided
            ? { targetDate: targetDateInput.data.targetDate }
            : {}),
          ...(statusInput.data.provided ? { status: statusInput.data.status } : {}),
        },
      });

      const milestone = await readRoadmapMilestoneById({
        db,
        projectId: input.projectId,
        milestoneId,
      });
      if (!milestone) {
        return createError(404, "roadmap-milestone-not-found");
      }

      return {
        ok: true,
        data: {
          milestone,
        },
      };
    } catch (error) {
      logServerError("updateProjectRoadmapMilestone", error, {
        actorUserId,
        projectId: input.projectId,
        milestoneId,
      });
      return createError(500, "roadmap-milestone-update-failed");
    }
  });
}

export async function deleteProjectRoadmapMilestone(input: {
  actorUserId: string;
  projectId: string;
  milestoneId: string;
}): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const milestoneId = normalizeText(input.milestoneId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!milestoneId) {
    return createError(400, "roadmap-milestone-not-found");
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

    try {
      const existingMilestone = await db.roadmapMilestone.findFirst({
        where: {
          id: milestoneId,
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });
      if (!existingMilestone) {
        return createError(404, "roadmap-milestone-not-found");
      }

      await db.roadmapMilestone.delete({
        where: {
          id: milestoneId,
        },
      });

      return {
        ok: true,
        data: {
          ok: true,
        },
      };
    } catch (error) {
      logServerError("deleteProjectRoadmapMilestone", error, {
        actorUserId,
        projectId: input.projectId,
        milestoneId,
      });
      return createError(500, "roadmap-milestone-delete-failed");
    }
  });
}

export async function reorderProjectRoadmapMilestones(
  input: ReorderRoadmapMilestonesInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (input.milestoneIds.length === 0) {
    return {
      ok: true,
      data: { ok: true },
    };
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

    try {
      const milestones = await db.roadmapMilestone.findMany({
        where: {
          projectId: input.projectId,
          id: {
            in: input.milestoneIds,
          },
        },
        select: {
          id: true,
        },
      });
      if (milestones.length !== input.milestoneIds.length) {
        return createError(400, "roadmap-milestones-invalid");
      }

      await Promise.all(
        input.milestoneIds.map((milestoneId, index) =>
          db.roadmapMilestone.update({
            where: {
              id: milestoneId,
            },
            data: {
              position: index,
            },
          })
        )
      );

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      logServerError("reorderProjectRoadmapMilestones", error, {
        actorUserId,
        projectId: input.projectId,
      });
      return createError(500, "roadmap-milestones-reorder-failed");
    }
  });
}
