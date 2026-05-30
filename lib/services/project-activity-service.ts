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

export const projectActivityServiceInternals = {
  normalizeId,
};
