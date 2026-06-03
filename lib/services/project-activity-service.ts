import { Prisma } from "@prisma/client";

import {
  buildProjectPrincipalWhere,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

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

interface TouchProjectActivityInput {
  db: DbClient;
  projectId: string;
  occurredAt?: Date;
}

interface ProjectActivitySnapshot {
  projectId: string;
  version: Date;
}

export type ProjectActivityEventDomain =
  | "task"
  | "task-comment"
  | "context-card"
  | "project";

export type ProjectActivityEventAction =
  | "created"
  | "updated"
  | "deleted"
  | "moved"
  | "reordered";

export interface ProjectActivityEventRecord {
  id: string;
  projectId: string;
  actorUserId: string | null;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  version: Date;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

type RawProjectActivityEventRecord = Omit<
  ProjectActivityEventRecord,
  "domain" | "action"
> & {
  domain: string;
  action: string;
};

interface RecordProjectActivityEventInput {
  db: DbClient;
  projectId: string;
  actorUserId: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  payload?: unknown;
  occurredAt?: Date;
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeId(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function canCallRawProjectActivityTouch(db: DbClient): db is DbClient & {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
} {
  return typeof (db as { $queryRaw?: unknown }).$queryRaw === "function";
}

function canCreateProjectActivityEvent(db: DbClient): db is DbClient & {
  projectActivityEvent: {
    create(input: {
      data: {
        projectId: string;
        actorUserId: string;
        domain: string;
        action: string;
        entityId: string;
        version: Date;
        payload: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      };
      select: ProjectActivityEventSelect;
    }): Promise<RawProjectActivityEventRecord>;
  };
} {
  return (
    typeof (db as { projectActivityEvent?: { create?: unknown } })
      .projectActivityEvent?.create === "function"
  );
}

function canListProjectActivityEvents(db: DbClient): db is DbClient & {
  projectActivityEvent: {
    findMany(input: {
      where: {
        projectId: string;
        version: { gt: Date };
      };
      orderBy: [{ version: "asc" }, { createdAt: "asc" }];
      take: number;
      select: ProjectActivityEventSelect;
    }): Promise<RawProjectActivityEventRecord[]>;
  };
} {
  return (
    typeof (db as { projectActivityEvent?: { findMany?: unknown } })
      .projectActivityEvent?.findMany === "function"
  );
}

const projectActivityEventSelect = {
  id: true,
  projectId: true,
  actorUserId: true,
  domain: true,
  action: true,
  entityId: true,
  version: true,
  payload: true,
  createdAt: true,
} as const;

type ProjectActivityEventSelect = typeof projectActivityEventSelect;

function toJsonPayload(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapProjectActivityEventRecord(
  event: RawProjectActivityEventRecord
): ProjectActivityEventRecord {
  return {
    ...event,
    domain: event.domain as ProjectActivityEventDomain,
    action: event.action as ProjectActivityEventAction,
  };
}

export async function touchProjectActivity(
  input: TouchProjectActivityInput
): Promise<Date> {
  const projectId = normalizeId(input.projectId);
  const occurredAt = input.occurredAt ?? new Date();
  if (!projectId) {
    return occurredAt;
  }

  if (process.env.NODE_ENV !== "test" && canCallRawProjectActivityTouch(input.db)) {
    const rows = await input.db.$queryRaw<Array<{ updated_at: Date }>>(
      Prisma.sql`SELECT app.touch_project_activity(${projectId}, ${occurredAt}) AS updated_at`
    );
    return rows[0]?.updated_at ?? occurredAt;
  }

  const projectDelegate = (input.db as { project?: { update?: unknown } }).project;
  if (typeof projectDelegate?.update !== "function") {
    return occurredAt;
  }

  await input.db.project.update({
    where: { id: projectId },
    data: { updatedAt: occurredAt },
    select: { id: true },
  });

  return occurredAt;
}

export async function recordProjectActivityEvent(
  input: RecordProjectActivityEventInput
): Promise<ProjectActivityEventRecord | null> {
  const projectId = normalizeId(input.projectId);
  const actorUserId = normalizeId(input.actorUserId);
  const entityId = normalizeId(input.entityId);
  const version = input.occurredAt ?? new Date();
  if (!projectId || !actorUserId || !entityId) {
    await touchProjectActivity({ db: input.db, projectId, occurredAt: version });
    return null;
  }

  await touchProjectActivity({ db: input.db, projectId, occurredAt: version });

  if (!canCreateProjectActivityEvent(input.db)) {
    return null;
  }

  const event = await input.db.projectActivityEvent.create({
    data: {
      projectId,
      actorUserId,
      domain: input.domain,
      action: input.action,
      entityId,
      version,
      payload: toJsonPayload(input.payload),
    },
    select: projectActivityEventSelect,
  });

  return mapProjectActivityEventRecord(event);
}

export async function getProjectActivitySnapshot(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ServiceResult<ProjectActivitySnapshot>> {
  const actorUserId = normalizeId(input.actorUserId);
  const projectId = normalizeId(input.projectId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!projectId) {
    return createError(404, "project-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        ...buildProjectPrincipalWhere(actorUserId),
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (!project) {
      return createError(404, "project-not-found");
    }

    return {
      ok: true,
      data: {
        projectId: project.id,
        version: project.updatedAt,
      },
    };
  });
}

export async function listProjectActivityEventsSince(input: {
  actorUserId: string;
  projectId: string;
  afterVersion: Date;
  take?: number;
}): Promise<ServiceResult<ProjectActivityEventRecord[]>> {
  const actorUserId = normalizeId(input.actorUserId);
  const projectId = normalizeId(input.projectId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!projectId) {
    return createError(404, "project-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    if (!canListProjectActivityEvents(db)) {
      return {
        ok: true,
        data: [],
      };
    }

    const events = await db.projectActivityEvent.findMany({
      where: {
        projectId,
        version: { gt: input.afterVersion },
      },
      orderBy: [{ version: "asc" }, { createdAt: "asc" }],
      take: input.take ?? 50,
      select: projectActivityEventSelect,
    });

    return {
      ok: true,
      data: events.map(mapProjectActivityEventRecord),
    };
  });
}

export async function touchProjectActivityAsActor(input: {
  actorUserId: string;
  projectId: string;
  occurredAt?: Date;
}): Promise<ServiceResult<{ version: Date }>> {
  const actorUserId = normalizeId(input.actorUserId);
  const projectId = normalizeId(input.projectId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    return {
      ok: true,
      data: {
        version: await touchProjectActivity({
          db,
          projectId,
          occurredAt: input.occurredAt,
        }),
      },
    };
  });
}

export async function recordProjectActivityEventAsActor(input: {
  actorUserId: string;
  projectId: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  payload?: unknown;
}): Promise<ServiceResult<{ event: ProjectActivityEventRecord | null; version: Date }>> {
  const actorUserId = normalizeId(input.actorUserId);
  const projectId = normalizeId(input.projectId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const version = new Date();
    return {
      ok: true,
      data: {
        event: await recordProjectActivityEvent({
          db,
          projectId,
          actorUserId,
          domain: input.domain,
          action: input.action,
          entityId: input.entityId,
          payload: input.payload,
          occurredAt: version,
        }),
        version,
      },
    };
  });
}

export const projectActivityServiceInternals = {
  normalizeId,
  toJsonPayload,
};
