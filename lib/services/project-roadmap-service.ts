import { logServerError } from "@/lib/observability/logger";
import {
  formatRoadmapTargetDate,
  isRoadmapStatus,
  type ProjectRoadmapEvent,
  type ProjectRoadmapPhase,
  type RoadmapStatus,
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

interface CreateRoadmapPhaseInput {
  actorUserId: string;
  projectId: string;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface UpdateRoadmapPhaseInput {
  actorUserId: string;
  projectId: string;
  phaseId: string;
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface CreateRoadmapEventInput {
  actorUserId: string;
  projectId: string;
  phaseId: string;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface UpdateRoadmapEventInput {
  actorUserId: string;
  projectId: string;
  eventId: string;
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

interface ReorderRoadmapPhasesInput {
  actorUserId: string;
  projectId: string;
  phaseIds: string[];
}

interface ReorderRoadmapEventsInput {
  actorUserId: string;
  projectId: string;
  phaseId: string;
  eventIds: string[];
}

interface MoveRoadmapEventInput {
  actorUserId: string;
  projectId: string;
  eventId: string;
  targetPhaseId: string;
  targetIndex: number;
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

function parseRoadmapStatus(
  value: unknown,
  options?: { fallback?: RoadmapStatus }
): ServiceResult<{ provided: boolean; status: RoadmapStatus }> {
  if (value === undefined || value === null) {
    return {
      ok: true,
      data: {
        provided: false,
        status: options?.fallback ?? "planned",
      },
    };
  }

  if (!isRoadmapStatus(value)) {
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

function validateTitle(title: string): ServiceErrorResult | null {
  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-short");
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return createError(400, "roadmap-title-too-long");
  }

  return null;
}

function validateDescription(description: string | null): ServiceErrorResult | null {
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return createError(400, "roadmap-description-too-long");
  }

  return null;
}

function mapRoadmapEvent(record: {
  id: string;
  phaseId: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: RoadmapStatus;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRoadmapEvent {
  return {
    id: record.id,
    phaseId: record.phaseId,
    title: record.title,
    description: record.description,
    targetDate: formatRoadmapTargetDate(record.targetDate),
    status: record.status,
    position: record.position,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapRoadmapPhase(record: {
  id: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: RoadmapStatus;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  events: Array<{
    id: string;
    phaseId: string;
    title: string;
    description: string | null;
    targetDate: Date | null;
    status: RoadmapStatus;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): ProjectRoadmapPhase {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    targetDate: formatRoadmapTargetDate(record.targetDate),
    status: record.status,
    position: record.position,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    events: record.events
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((event) => mapRoadmapEvent(event)),
  };
}

async function readRoadmapPhaseById(input: {
  db: DbClient;
  projectId: string;
  phaseId: string;
}): Promise<ProjectRoadmapPhase | null> {
  const phase = await input.db.roadmapPhase.findFirst({
    where: {
      id: input.phaseId,
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
      events: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          phaseId: true,
          title: true,
          description: true,
          targetDate: true,
          status: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return phase ? mapRoadmapPhase(phase) : null;
}

async function readRoadmapEventById(input: {
  db: DbClient;
  projectId: string;
  eventId: string;
}): Promise<ProjectRoadmapEvent | null> {
  const event = await input.db.roadmapEvent.findFirst({
    where: {
      id: input.eventId,
      projectId: input.projectId,
    },
    select: {
      id: true,
      phaseId: true,
      title: true,
      description: true,
      targetDate: true,
      status: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return event ? mapRoadmapEvent(event) : null;
}

async function requireRoadmapEditor(input: {
  actorUserId: string;
  projectId: string;
  db: DbClient;
}): Promise<ServiceResult<{ ok: true }>> {
  const access = await requireProjectRole({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    minimumRole: "editor",
    db: input.db,
  });

  if (!access.ok) {
    return createError(access.status, access.error);
  }

  return {
    ok: true,
    data: { ok: true },
  };
}

async function listProjectRoadmapPhasesInDb(input: {
  db: DbClient;
  projectId: string;
}): Promise<ProjectRoadmapPhase[]> {
  const phases = await input.db.roadmapPhase.findMany({
    where: {
      projectId: input.projectId,
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
      events: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          phaseId: true,
          title: true,
          description: true,
          targetDate: true,
          status: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return phases.map((phase) => mapRoadmapPhase(phase));
}

export function isValidRoadmapPhaseReorderPayload(
  payload: unknown
): payload is { phaseIds: string[] } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const phaseIds = (payload as { phaseIds?: unknown }).phaseIds;
  if (!Array.isArray(phaseIds)) {
    return false;
  }

  const seenPhaseIds = new Set<string>();
  return phaseIds.every((phaseId) => {
    if (typeof phaseId !== "string") {
      return false;
    }

    const trimmedPhaseId = phaseId.trim();
    if (!trimmedPhaseId || trimmedPhaseId !== phaseId) {
      return false;
    }

    if (seenPhaseIds.has(trimmedPhaseId)) {
      return false;
    }

    seenPhaseIds.add(trimmedPhaseId);
    return true;
  });
}

export function isValidRoadmapEventReorderPayload(
  payload: unknown
): payload is { phaseId: string; eventIds: string[] } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const phaseId = (payload as { phaseId?: unknown }).phaseId;
  const eventIds = (payload as { eventIds?: unknown }).eventIds;
  if (typeof phaseId !== "string" || phaseId.trim() !== phaseId || !phaseId) {
    return false;
  }
  if (!Array.isArray(eventIds)) {
    return false;
  }

  const seenEventIds = new Set<string>();
  return eventIds.every((eventId) => {
    if (typeof eventId !== "string") {
      return false;
    }

    const trimmedEventId = eventId.trim();
    if (!trimmedEventId || trimmedEventId !== eventId) {
      return false;
    }

    if (seenEventIds.has(trimmedEventId)) {
      return false;
    }

    seenEventIds.add(trimmedEventId);
    return true;
  });
}

export function isValidRoadmapEventMovePayload(
  payload: unknown
): payload is { eventId: string; targetPhaseId: string; targetIndex: number } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const { eventId, targetPhaseId, targetIndex } = payload as {
    eventId?: unknown;
    targetPhaseId?: unknown;
    targetIndex?: unknown;
  };

  return (
    typeof eventId === "string" &&
    eventId.trim() === eventId &&
    eventId.length > 0 &&
    typeof targetPhaseId === "string" &&
    targetPhaseId.trim() === targetPhaseId &&
    targetPhaseId.length > 0 &&
    Number.isInteger(targetIndex) &&
    (targetIndex as number) >= 0
  );
}

export async function listProjectRoadmapPhases(
  projectId: string,
  actorUserId: string
): Promise<ProjectRoadmapPhase[]> {
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

    return listProjectRoadmapPhasesInDb({
      db,
      projectId,
    });
  }) as Promise<ProjectRoadmapPhase[]>;
}

export async function createProjectRoadmapPhase(
  input: CreateRoadmapPhaseInput
): Promise<ServiceResult<{ phase: ProjectRoadmapPhase }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const title = normalizeText(input.title);
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);
  const statusInput = parseRoadmapStatus(input.status);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const titleError = validateTitle(title);
  if (titleError) {
    return titleError;
  }

  const descriptionError = validateDescription(description);
  if (descriptionError) {
    return descriptionError;
  }

  if (!targetDateInput.ok) {
    return targetDateInput;
  }

  if (!statusInput.ok) {
    return statusInput;
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const maxPosition = await db.roadmapPhase.aggregate({
        where: {
          projectId: input.projectId,
        },
        _max: {
          position: true,
        },
      });

      const createdPhase = await db.roadmapPhase.create({
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

      const phase = await readRoadmapPhaseById({
        db,
        projectId: input.projectId,
        phaseId: createdPhase.id,
      });
      if (!phase) {
        return createError(500, "roadmap-phase-create-failed");
      }

      return {
        ok: true,
        data: {
          phase,
        },
      };
    } catch (error) {
      logServerError("createProjectRoadmapPhase", error, {
        actorUserId,
        projectId: input.projectId,
      });
      return createError(500, "roadmap-phase-create-failed");
    }
  });
}

export async function updateProjectRoadmapPhase(
  input: UpdateRoadmapPhaseInput
): Promise<ServiceResult<{ phase: ProjectRoadmapPhase }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const phaseId = normalizeText(input.phaseId);
  const titleProvided = Object.prototype.hasOwnProperty.call(input, "title");
  const title = normalizeText(input.title);
  const descriptionProvided = Object.prototype.hasOwnProperty.call(input, "description");
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!phaseId) {
    return createError(400, "roadmap-phase-not-found");
  }

  if (titleProvided) {
    const titleError = validateTitle(title);
    if (titleError) {
      return titleError;
    }
  }

  if (descriptionProvided) {
    const descriptionError = validateDescription(description);
    if (descriptionError) {
      return descriptionError;
    }
  }

  if (!targetDateInput.ok) {
    return targetDateInput;
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingPhase = await db.roadmapPhase.findFirst({
        where: {
          id: phaseId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          status: true,
        },
      });
      if (!existingPhase) {
        return createError(404, "roadmap-phase-not-found");
      }

      const statusInput = parseRoadmapStatus(input.status, {
        fallback: existingPhase.status as RoadmapStatus,
      });
      if (!statusInput.ok) {
        return statusInput;
      }

      await db.roadmapPhase.update({
        where: {
          id: phaseId,
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

      const phase = await readRoadmapPhaseById({
        db,
        projectId: input.projectId,
        phaseId,
      });
      if (!phase) {
        return createError(404, "roadmap-phase-not-found");
      }

      return {
        ok: true,
        data: {
          phase,
        },
      };
    } catch (error) {
      logServerError("updateProjectRoadmapPhase", error, {
        actorUserId,
        projectId: input.projectId,
        phaseId,
      });
      return createError(500, "roadmap-phase-update-failed");
    }
  });
}

export async function deleteProjectRoadmapPhase(input: {
  actorUserId: string;
  projectId: string;
  phaseId: string;
}): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const phaseId = normalizeText(input.phaseId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!phaseId) {
    return createError(400, "roadmap-phase-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingPhase = await db.roadmapPhase.findFirst({
        where: {
          id: phaseId,
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });
      if (!existingPhase) {
        return createError(404, "roadmap-phase-not-found");
      }

      await db.roadmapPhase.delete({
        where: {
          id: phaseId,
        },
      });

      return {
        ok: true,
        data: {
          ok: true,
        },
      };
    } catch (error) {
      logServerError("deleteProjectRoadmapPhase", error, {
        actorUserId,
        projectId: input.projectId,
        phaseId,
      });
      return createError(500, "roadmap-phase-delete-failed");
    }
  });
}

export async function createProjectRoadmapEvent(
  input: CreateRoadmapEventInput
): Promise<ServiceResult<{ event: ProjectRoadmapEvent; phase: ProjectRoadmapPhase }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const phaseId = normalizeText(input.phaseId);
  const title = normalizeText(input.title);
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!phaseId) {
    return createError(400, "roadmap-phase-not-found");
  }

  const titleError = validateTitle(title);
  if (titleError) {
    return titleError;
  }

  const descriptionError = validateDescription(description);
  if (descriptionError) {
    return descriptionError;
  }

  if (!targetDateInput.ok) {
    return targetDateInput;
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingPhase = await db.roadmapPhase.findFirst({
        where: {
          id: phaseId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          status: true,
        },
      });
      if (!existingPhase) {
        return createError(404, "roadmap-phase-not-found");
      }

      const statusInput = parseRoadmapStatus(input.status, {
        fallback: existingPhase.status as RoadmapStatus,
      });
      if (!statusInput.ok) {
        return statusInput;
      }

      const maxPosition = await db.roadmapEvent.aggregate({
        where: {
          phaseId,
        },
        _max: {
          position: true,
        },
      });

      const createdEvent = await db.roadmapEvent.create({
        data: {
          projectId: input.projectId,
          phaseId,
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

      const event = await readRoadmapEventById({
        db,
        projectId: input.projectId,
        eventId: createdEvent.id,
      });
      const phase = await readRoadmapPhaseById({
        db,
        projectId: input.projectId,
        phaseId,
      });
      if (!event || !phase) {
        return createError(500, "roadmap-event-create-failed");
      }

      return {
        ok: true,
        data: {
          event,
          phase,
        },
      };
    } catch (error) {
      logServerError("createProjectRoadmapEvent", error, {
        actorUserId,
        projectId: input.projectId,
        phaseId,
      });
      return createError(500, "roadmap-event-create-failed");
    }
  });
}

export async function updateProjectRoadmapEvent(
  input: UpdateRoadmapEventInput
): Promise<ServiceResult<{ event: ProjectRoadmapEvent; phase: ProjectRoadmapPhase }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const eventId = normalizeText(input.eventId);
  const titleProvided = Object.prototype.hasOwnProperty.call(input, "title");
  const title = normalizeText(input.title);
  const descriptionProvided = Object.prototype.hasOwnProperty.call(input, "description");
  const description = normalizeOptionalDescription(input.description);
  const targetDateInput = parseRoadmapTargetDate(input.targetDate);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!eventId) {
    return createError(400, "roadmap-event-not-found");
  }

  if (titleProvided) {
    const titleError = validateTitle(title);
    if (titleError) {
      return titleError;
    }
  }

  if (descriptionProvided) {
    const descriptionError = validateDescription(description);
    if (descriptionError) {
      return descriptionError;
    }
  }

  if (!targetDateInput.ok) {
    return targetDateInput;
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingEvent = await db.roadmapEvent.findFirst({
        where: {
          id: eventId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          phaseId: true,
          status: true,
        },
      });
      if (!existingEvent) {
        return createError(404, "roadmap-event-not-found");
      }

      const statusInput = parseRoadmapStatus(input.status, {
        fallback: existingEvent.status as RoadmapStatus,
      });
      if (!statusInput.ok) {
        return statusInput;
      }

      await db.roadmapEvent.update({
        where: {
          id: eventId,
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

      const event = await readRoadmapEventById({
        db,
        projectId: input.projectId,
        eventId,
      });
      const phase = await readRoadmapPhaseById({
        db,
        projectId: input.projectId,
        phaseId: existingEvent.phaseId,
      });
      if (!event || !phase) {
        return createError(404, "roadmap-event-not-found");
      }

      return {
        ok: true,
        data: {
          event,
          phase,
        },
      };
    } catch (error) {
      logServerError("updateProjectRoadmapEvent", error, {
        actorUserId,
        projectId: input.projectId,
        eventId,
      });
      return createError(500, "roadmap-event-update-failed");
    }
  });
}

export async function deleteProjectRoadmapEvent(input: {
  actorUserId: string;
  projectId: string;
  eventId: string;
}): Promise<ServiceResult<{ ok: true; phaseId: string }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const eventId = normalizeText(input.eventId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!eventId) {
    return createError(400, "roadmap-event-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingEvent = await db.roadmapEvent.findFirst({
        where: {
          id: eventId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          phaseId: true,
        },
      });
      if (!existingEvent) {
        return createError(404, "roadmap-event-not-found");
      }

      await db.roadmapEvent.delete({
        where: {
          id: eventId,
        },
      });

      return {
        ok: true,
        data: {
          ok: true,
          phaseId: existingEvent.phaseId,
        },
      };
    } catch (error) {
      logServerError("deleteProjectRoadmapEvent", error, {
        actorUserId,
        projectId: input.projectId,
        eventId,
      });
      return createError(500, "roadmap-event-delete-failed");
    }
  });
}

export async function reorderProjectRoadmapPhases(
  input: ReorderRoadmapPhasesInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (input.phaseIds.length === 0) {
    return {
      ok: true,
      data: { ok: true },
    };
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const phases = await db.roadmapPhase.findMany({
        where: {
          projectId: input.projectId,
          id: {
            in: input.phaseIds,
          },
        },
        select: {
          id: true,
        },
      });
      if (phases.length !== input.phaseIds.length) {
        return createError(400, "roadmap-phases-invalid");
      }

      await Promise.all(
        input.phaseIds.map((phaseId, index) =>
          db.roadmapPhase.update({
            where: {
              id: phaseId,
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
      logServerError("reorderProjectRoadmapPhases", error, {
        actorUserId,
        projectId: input.projectId,
      });
      return createError(500, "roadmap-phases-reorder-failed");
    }
  });
}

export async function reorderProjectRoadmapEvents(
  input: ReorderRoadmapEventsInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const phaseId = normalizeText(input.phaseId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!phaseId) {
    return createError(400, "roadmap-phase-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const phase = await db.roadmapPhase.findFirst({
        where: {
          id: phaseId,
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });
      if (!phase) {
        return createError(404, "roadmap-phase-not-found");
      }

      const events = await db.roadmapEvent.findMany({
        where: {
          projectId: input.projectId,
          phaseId,
          id: {
            in: input.eventIds,
          },
        },
        select: {
          id: true,
        },
      });
      if (events.length !== input.eventIds.length) {
        return createError(400, "roadmap-events-invalid");
      }

      await Promise.all(
        input.eventIds.map((eventId, index) =>
          db.roadmapEvent.update({
            where: {
              id: eventId,
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
      logServerError("reorderProjectRoadmapEvents", error, {
        actorUserId,
        projectId: input.projectId,
        phaseId,
      });
      return createError(500, "roadmap-events-reorder-failed");
    }
  });
}

export async function moveProjectRoadmapEvent(
  input: MoveRoadmapEventInput
): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const eventId = normalizeText(input.eventId);
  const targetPhaseId = normalizeText(input.targetPhaseId);

  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!eventId) {
    return createError(400, "roadmap-event-not-found");
  }
  if (!targetPhaseId) {
    return createError(400, "roadmap-phase-not-found");
  }
  if (!Number.isInteger(input.targetIndex) || input.targetIndex < 0) {
    return createError(400, "roadmap-target-index-invalid");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const editorCheck = await requireRoadmapEditor({
      actorUserId,
      projectId: input.projectId,
      db,
    });
    if (!editorCheck.ok) {
      return editorCheck;
    }

    try {
      const existingEvent = await db.roadmapEvent.findFirst({
        where: {
          id: eventId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          phaseId: true,
        },
      });
      if (!existingEvent) {
        return createError(404, "roadmap-event-not-found");
      }

      const targetPhase = await db.roadmapPhase.findFirst({
        where: {
          id: targetPhaseId,
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });
      if (!targetPhase) {
        return createError(404, "roadmap-phase-not-found");
      }

      const sourceEvents = await db.roadmapEvent.findMany({
        where: {
          projectId: input.projectId,
          phaseId: existingEvent.phaseId,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
        },
      });

      const targetEvents = existingEvent.phaseId === targetPhaseId
        ? sourceEvents
        : await db.roadmapEvent.findMany({
            where: {
              projectId: input.projectId,
              phaseId: targetPhaseId,
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
            },
          });

      const sourceEventIds = sourceEvents.map((event) => event.id);
      if (!sourceEventIds.includes(eventId)) {
        return createError(404, "roadmap-event-not-found");
      }

      const currentSourceIds = sourceEventIds.filter((id) => id !== eventId);
      const targetIndex = Math.min(input.targetIndex, targetEvents.length);

      if (existingEvent.phaseId === targetPhaseId) {
        currentSourceIds.splice(targetIndex, 0, eventId);

        await Promise.all(
          currentSourceIds.map((orderedEventId, index) =>
            db.roadmapEvent.update({
              where: {
                id: orderedEventId,
              },
              data: {
                position: index,
              },
            })
          )
        );
      } else {
        const currentTargetIds = targetEvents.map((event) => event.id);
        currentTargetIds.splice(targetIndex, 0, eventId);

        await db.$transaction([
          ...currentSourceIds.map((orderedEventId, index) =>
            db.roadmapEvent.update({
              where: {
                id: orderedEventId,
              },
              data: {
                position: index,
              },
            })
          ),
          db.roadmapEvent.update({
            where: {
              id: eventId,
            },
            data: {
              phaseId: targetPhaseId,
            },
          }),
          ...currentTargetIds.map((orderedEventId, index) =>
            db.roadmapEvent.update({
              where: {
                id: orderedEventId,
              },
              data: {
                position: index,
              },
            })
          ),
        ]);
      }

      return {
        ok: true,
        data: {
          ok: true,
        },
      };
    } catch (error) {
      logServerError("moveProjectRoadmapEvent", error, {
        actorUserId,
        projectId: input.projectId,
        eventId,
        targetPhaseId,
        targetIndex: input.targetIndex,
      });
      return createError(500, "roadmap-event-move-failed");
    }
  });
}
