import { Prisma, type ProjectActorKind } from "@prisma/client";

import type { ProjectActorSummary } from "@/lib/project-actor";
import type {
  ProjectActivityEventAction,
  ProjectActivityEventDomain,
} from "@/lib/project-activity-event-types";
import { prisma } from "@/lib/prisma";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import {
  buildProjectPrincipalWhere,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import {
  loadProjectActorRegistry,
  mapProjectActorCredential,
  mapProjectActorHuman,
  mapStoredProjectActorFromRegistry,
  projectActorCredentialSelect,
  projectActorUserSelect,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
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

interface TouchProjectMembershipActivityInput extends TouchProjectActivityInput {
  actorUserId: string;
  invitationId: string;
}

interface ProjectActivitySnapshot {
  projectId: string;
  version: Date;
}

export interface ProjectActivityEventRecord {
  id: string;
  projectId: string;
  actorUserId: string | null;
  actorCredentialId: string | null;
  actorKind: ProjectActorKind | null;
  actorDisplayNameSnapshot: string | null;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  entityDisplayNameSnapshot: string | null;
  summary: string | null;
  changes: Prisma.JsonValue | null;
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

export interface ProjectActivityEventCursor {
  version: Date;
  createdAt?: Date | null;
  id?: string | null;
}

export interface ProjectActivityChangeEntry {
  field: string;
  before?: unknown;
  after?: unknown;
}

export const PROJECT_ACTIVITY_CHANGE_FIELD_LIMIT = 20;
export const PROJECT_ACTIVITY_CHANGE_VALUE_LIMIT = 200;
export const PROJECT_ACTIVITY_SUMMARY_LIMIT = 280;
export const PROJECT_ACTIVITY_ENTITY_NAME_LIMIT = 160;
export const PROJECT_ACTIVITY_RETENTION_DAYS = 365;
export const PROJECT_ACTIVITY_PRUNE_BATCH_SIZE = 500;
export const PROJECT_ACTIVITY_PRUNE_MAX_BATCHES = 20;
export const PROJECT_ACTIVITY_HISTORY_PAGE_SIZE = 25;
export const PROJECT_ACTIVITY_HISTORY_PAGE_SIZE_MAX = 50;

interface RecordProjectActivityEventInput {
  db: DbClient;
  projectId: string;
  actorUserId: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  payload?: unknown;
  occurredAt?: Date;
  agentAccess?: AgentProjectAccessContext;
  entityDisplayNameSnapshot?: string | null;
  changes?: ProjectActivityChangeEntry[] | null;
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

function canCallRawProjectMembershipActivityTouch(
  db: DbClient
): db is DbClient & {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
} {
  return typeof (db as { $queryRaw?: unknown }).$queryRaw === "function";
}

function canCallRawProjectActivityEvent(db: DbClient): db is DbClient & {
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
        actorCredentialId: string | null;
        actorKind: ProjectActorKind | null;
        actorDisplayNameSnapshot: string | null;
        domain: string;
        action: string;
        entityId: string;
        entityDisplayNameSnapshot: string | null;
        summary: string;
        changes: Prisma.InputJsonValue | typeof Prisma.JsonNull;
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
      where: Prisma.ProjectActivityEventWhereInput;
      orderBy: [{ version: "asc" }, { createdAt: "asc" }, { id: "asc" }];
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

function canListProjectActivityHistory(db: DbClient): db is DbClient & {
  projectActivityEvent: {
    findMany(input: {
      where: Prisma.ProjectActivityEventWhereInput;
      orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }];
      take: number;
      select: ProjectActivityHistorySelect;
    }): Promise<RawProjectActivityHistoryRow[]>;
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
  actorCredentialId: true,
  actorKind: true,
  actorDisplayNameSnapshot: true,
  domain: true,
  action: true,
  entityId: true,
  entityDisplayNameSnapshot: true,
  summary: true,
  changes: true,
  version: true,
  payload: true,
  createdAt: true,
} as const;

type ProjectActivityEventSelect = typeof projectActivityEventSelect;

// History reads never select the transport payload: it exists for live refresh
// and may contain raw request bodies that are not part of the durable surface.
const projectActivityHistorySelect = {
  id: true,
  projectId: true,
  actorUserId: true,
  actorCredentialId: true,
  actorKind: true,
  actorDisplayNameSnapshot: true,
  domain: true,
  action: true,
  entityId: true,
  entityDisplayNameSnapshot: true,
  summary: true,
  changes: true,
  version: true,
  createdAt: true,
} as const;

type ProjectActivityHistorySelect = typeof projectActivityHistorySelect;
type RawProjectActivityHistoryRow = Omit<
  ProjectActivityEventRecord,
  "domain" | "action" | "payload"
> & {
  domain: string;
  action: string;
};

function toJsonPayload(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toJsonPayloadString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
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

function truncateActivityText(value: string, limit: number): string {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function formatActivityChangeValue(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  let serialized: string;
  if (typeof value === "string") {
    serialized = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    serialized = String(value);
  } else if (value instanceof Date) {
    serialized = value.toISOString();
  } else {
    try {
      serialized = JSON.stringify(value) ?? "";
    } catch {
      return "[unserializable]";
    }
  }

  return truncateActivityText(serialized, PROJECT_ACTIVITY_CHANGE_VALUE_LIMIT);
}

export function buildProjectActivityChanges(
  entries: ProjectActivityChangeEntry[] | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const bounded: Array<{ field: string; before: string | null; after: string | null }> =
    [];
  for (const entry of entries) {
    if (bounded.length >= PROJECT_ACTIVITY_CHANGE_FIELD_LIMIT) {
      break;
    }

    const field = truncateActivityText(
      normalizeId(entry.field),
      PROJECT_ACTIVITY_CHANGE_FIELD_LIMIT * 4
    );
    if (!field) {
      continue;
    }

    const before = formatActivityChangeValue(entry.before);
    const after = formatActivityChangeValue(entry.after);
    if (before === after) {
      continue;
    }

    bounded.push({ field, before, after });
  }

  return bounded.length > 0 ? bounded : undefined;
}

const PROJECT_ACTIVITY_DOMAIN_LABELS: Record<ProjectActivityEventDomain, string> = {
  task: "task",
  "task-comment": "comment",
  "context-card": "context card",
  "meeting-note": "meeting note",
  epic: "epic",
  roadmap: "roadmap item",
  attachment: "attachment",
  membership: "member",
  project: "project",
};

const PROJECT_ACTIVITY_ACTION_LABELS: Record<ProjectActivityEventAction, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  moved: "Moved",
  reordered: "Reordered",
  archived: "Archived",
  unarchived: "Unarchived",
  transferred: "Transferred",
};

export function buildProjectActivitySummary(input: {
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityDisplayNameSnapshot?: string | null;
}): string {
  const domainLabel = PROJECT_ACTIVITY_DOMAIN_LABELS[input.domain];
  const actionLabel = PROJECT_ACTIVITY_ACTION_LABELS[input.action];
  const entityName = normalizeId(input.entityDisplayNameSnapshot);

  return truncateActivityText(
    entityName ? `${actionLabel} ${domainLabel} "${entityName}"` : `${actionLabel} ${domainLabel}`,
    PROJECT_ACTIVITY_SUMMARY_LIMIT
  );
}

async function resolveActivityActorSnapshot(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<{
  actorKind: ProjectActorKind | null;
  actorCredentialId: string | null;
  actorDisplayNameSnapshot: string | null;
}> {
  const credentialId = normalizeId(input.agentAccess?.credentialId);
  if (credentialId) {
    const credential = await input.db.apiCredential.findFirst({
      where: { id: credentialId, projectId: input.projectId },
      select: projectActorCredentialSelect,
    });
    if (!credential) {
      return {
        actorKind: null,
        actorCredentialId: null,
        actorDisplayNameSnapshot: null,
      };
    }

    const summary = mapProjectActorCredential(credential, new Date());
    return {
      actorKind: "agent",
      actorCredentialId: summary.id,
      actorDisplayNameSnapshot: truncateActivityText(summary.displayName, 80),
    };
  }

  const user = await input.db.user.findUnique({
    where: { id: input.actorUserId },
    select: projectActorUserSelect,
  });
  if (!user) {
    return {
      actorKind: null,
      actorCredentialId: null,
      actorDisplayNameSnapshot: null,
    };
  }

  const summary = mapProjectActorHuman(user, "active");
  return {
    actorKind: "human",
    actorCredentialId: null,
    actorDisplayNameSnapshot: truncateActivityText(summary.displayName, 80),
  };
}

function buildProjectActivityEventCursorWhere(
  projectId: string,
  cursor: ProjectActivityEventCursor
): Prisma.ProjectActivityEventWhereInput {
  if (!cursor.createdAt || !cursor.id) {
    return {
      projectId,
      version: { gt: cursor.version },
    };
  }

  return {
    projectId,
    OR: [
      { version: { gt: cursor.version } },
      {
        version: cursor.version,
        createdAt: { gt: cursor.createdAt },
      },
      {
        version: cursor.version,
        createdAt: cursor.createdAt,
        id: { gt: cursor.id },
      },
    ],
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

export async function touchProjectMembershipActivity(
  input: TouchProjectMembershipActivityInput
): Promise<Date> {
  const projectId = normalizeId(input.projectId);
  const actorUserId = normalizeId(input.actorUserId);
  const invitationId = normalizeId(input.invitationId);
  const occurredAt = input.occurredAt ?? new Date();
  if (!projectId || !actorUserId || !invitationId) {
    return occurredAt;
  }

  if (
    process.env.NODE_ENV !== "test" &&
    canCallRawProjectMembershipActivityTouch(input.db)
  ) {
    const rows = await input.db.$queryRaw<Array<{ updated_at: Date }>>(
      Prisma.sql`SELECT app.touch_project_membership_activity(${projectId}, ${actorUserId}, ${invitationId}, ${occurredAt}) AS updated_at`
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

  if (canCreateProjectActivityEvent(input.db)) {
    const actor = await resolveActivityActorSnapshot({
      db: input.db,
      actorUserId,
      projectId,
      agentAccess: input.agentAccess,
    });
    const entityDisplayNameSnapshot = input.entityDisplayNameSnapshot
      ? truncateActivityText(
          normalizeId(input.entityDisplayNameSnapshot),
          PROJECT_ACTIVITY_ENTITY_NAME_LIMIT
        )
      : null;
    const event = await input.db.projectActivityEvent.create({
      data: {
        projectId,
        actorUserId,
        actorCredentialId: actor.actorCredentialId,
        actorKind: actor.actorKind,
        actorDisplayNameSnapshot: actor.actorDisplayNameSnapshot,
        domain: input.domain,
        action: input.action,
        entityId,
        entityDisplayNameSnapshot: entityDisplayNameSnapshot || null,
        summary: buildProjectActivitySummary({
          domain: input.domain,
          action: input.action,
          entityDisplayNameSnapshot,
        }),
        changes: buildProjectActivityChanges(input.changes) ?? Prisma.JsonNull,
        version,
        payload: toJsonPayload(input.payload),
      },
      select: projectActivityEventSelect,
    });

    return mapProjectActivityEventRecord(event);
  }

  if (
    process.env.NODE_ENV !== "test" &&
    canCallRawProjectActivityEvent(input.db)
  ) {
    const rows = await input.db.$queryRaw<RawProjectActivityEventRecord[]>(
      Prisma.sql`
        SELECT *
        FROM app.record_project_activity_event(
          ${projectId},
          ${actorUserId},
          ${input.domain},
          ${input.action},
          ${entityId},
          ${toJsonPayloadString(input.payload)}::jsonb,
          ${version}
        )
      `
    );
    return rows[0] ? mapProjectActivityEventRecord(rows[0]) : null;
  }

  return null;
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
  afterCursor?: ProjectActivityEventCursor;
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
      where: buildProjectActivityEventCursorWhere(
        projectId,
        input.afterCursor ?? { version: input.afterVersion }
      ),
      orderBy: [{ version: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: input.take ?? 50,
      select: projectActivityEventSelect,
    });

    return {
      ok: true,
      data: events.map(mapProjectActivityEventRecord),
    };
  });
}

export interface ProjectActivityHistoryEntry {
  id: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  entityDisplayNameSnapshot: string | null;
  summary: string | null;
  changes: ProjectActivityChangeEntry[] | null;
  version: Date;
  createdAt: Date;
  actor: ProjectActorSummary | null;
}

export interface ProjectActivityHistoryPage {
  entries: ProjectActivityHistoryEntry[];
  nextCursor: string | null;
}

interface DecodedProjectActivityHistoryCursor {
  version: Date;
  createdAt: Date;
  id: string;
}

export function encodeProjectActivityHistoryCursor(cursor: {
  version: Date;
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      v: cursor.version.toISOString(),
      c: cursor.createdAt.toISOString(),
      i: cursor.id,
    }),
    "utf8"
  ).toString("base64url");
}

export function decodeProjectActivityHistoryCursor(
  value: string | null | undefined
): DecodedProjectActivityHistoryCursor | null {
  const encoded = normalizeId(value);
  if (!encoded) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as { v?: unknown; c?: unknown; i?: unknown };
  if (
    typeof candidate.v !== "string" ||
    typeof candidate.c !== "string" ||
    typeof candidate.i !== "string" ||
    !candidate.i.trim()
  ) {
    return null;
  }

  const version = new Date(candidate.v);
  const createdAt = new Date(candidate.c);
  if (Number.isNaN(version.getTime()) || Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return { version, createdAt, id: candidate.i };
}

function extractActivityChangeEntries(
  value: Prisma.JsonValue | null
): ProjectActivityChangeEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries: ProjectActivityChangeEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const candidate = item as { field?: unknown; before?: unknown; after?: unknown };
    if (typeof candidate.field !== "string" || !candidate.field.trim()) {
      continue;
    }

    entries.push({
      field: candidate.field,
      before: typeof candidate.before === "string" ? candidate.before : null,
      after: typeof candidate.after === "string" ? candidate.after : null,
    });
  }

  return entries.length > 0 ? entries : null;
}

function mapProjectActivityHistoryEntry(input: {
  row: RawProjectActivityHistoryRow;
  registry: ProjectActorRegistry | null;
}): ProjectActivityHistoryEntry {
  const actorId =
    normalizeId(input.row.actorCredentialId) || normalizeId(input.row.actorUserId);
  const actorKind: "human" | "agent" | null = actorId
    ? input.row.actorKind ?? (input.row.actorCredentialId ? "agent" : "human")
    : null;

  return {
    id: input.row.id,
    domain: input.row.domain as ProjectActivityEventDomain,
    action: input.row.action as ProjectActivityEventAction,
    entityId: input.row.entityId,
    entityDisplayNameSnapshot: input.row.entityDisplayNameSnapshot,
    summary: input.row.summary,
    changes: extractActivityChangeEntries(input.row.changes),
    version: input.row.version,
    createdAt: input.row.createdAt,
    actor: actorKind
      ? mapStoredProjectActorFromRegistry({
          kind: actorKind,
          id: actorId,
          displayNameSnapshot: input.row.actorDisplayNameSnapshot,
          registry: input.registry,
        })
      : null,
  };
}

export async function listProjectActivityHistory(input: {
  actorUserId: string;
  projectId: string;
  cursor?: string | null;
  take?: number;
}): Promise<ServiceResult<ProjectActivityHistoryPage>> {
  const actorUserId = normalizeId(input.actorUserId);
  const projectId = normalizeId(input.projectId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!projectId) {
    return createError(404, "project-not-found");
  }

  const take = Math.min(
    Math.max(Math.trunc(input.take ?? PROJECT_ACTIVITY_HISTORY_PAGE_SIZE), 1),
    PROJECT_ACTIVITY_HISTORY_PAGE_SIZE_MAX
  );

  let cursor: DecodedProjectActivityHistoryCursor | null = null;
  if (normalizeId(input.cursor)) {
    cursor = decodeProjectActivityHistoryCursor(input.cursor);
    if (!cursor) {
      return createError(400, "invalid-cursor");
    }
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

    if (!canListProjectActivityHistory(db)) {
      return {
        ok: true,
        data: { entries: [], nextCursor: null },
      };
    }

    const rows = await db.projectActivityEvent.findMany({
      where: cursor
        ? {
            projectId,
            OR: [
              { version: { lt: cursor.version } },
              { version: cursor.version, createdAt: { lt: cursor.createdAt } },
              {
                version: cursor.version,
                createdAt: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          }
        : { projectId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: projectActivityHistorySelect,
    });

    const pageRows = rows.slice(0, take);
    const registry = await loadProjectActorRegistry({ db, projectId });

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      rows.length > take && lastRow
        ? encodeProjectActivityHistoryCursor({
            version: lastRow.version,
            createdAt: lastRow.createdAt,
            id: lastRow.id,
          })
        : null;

    return {
      ok: true,
      data: {
        entries: pageRows.map((row) =>
          mapProjectActivityHistoryEntry({ row, registry })
        ),
        nextCursor,
      },
    };
  });
}

export interface ProjectActivityPruneSummary {
  deleted: number;
  batches: number;
  cutoff: Date;
}

export async function pruneProjectActivityHistory(input?: {
  db?: DbClient;
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
}): Promise<ProjectActivityPruneSummary> {
  const now = input?.now ?? new Date();
  const retentionDays = input?.retentionDays ?? PROJECT_ACTIVITY_RETENTION_DAYS;
  const batchSize = input?.batchSize ?? PROJECT_ACTIVITY_PRUNE_BATCH_SIZE;
  const maxBatches = input?.maxBatches ?? PROJECT_ACTIVITY_PRUNE_MAX_BATCHES;
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const db = input?.db ?? prisma;

  const summary: ProjectActivityPruneSummary = {
    deleted: 0,
    batches: 0,
    cutoff,
  };
  if (!canCallRawProjectActivityTouch(db)) {
    return summary;
  }

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await db.$queryRaw<Array<{ deleted: number }>>(
      Prisma.sql`SELECT app.prune_project_activity_events(${cutoff}, ${batchSize}) AS deleted`
    );
    const deleted = Number(rows[0]?.deleted ?? 0);
    summary.batches += 1;
    summary.deleted += deleted;
    if (!Number.isFinite(deleted) || deleted < batchSize) {
      break;
    }
  }

  return summary;
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
  agentAccess?: AgentProjectAccessContext;
  entityDisplayNameSnapshot?: string | null;
  changes?: ProjectActivityChangeEntry[] | null;
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
          agentAccess: input.agentAccess,
          entityDisplayNameSnapshot: input.entityDisplayNameSnapshot,
          changes: input.changes,
        }),
        version,
      },
    };
  });
}

export const projectActivityServiceInternals = {
  buildProjectActivityEventCursorWhere,
  normalizeId,
  toJsonPayload,
  toJsonPayloadString,
};
