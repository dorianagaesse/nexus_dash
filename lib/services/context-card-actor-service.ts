import { Prisma } from "@prisma/client";

import { resolveAgentCredentialStatus } from "@/lib/agent-access";
import type {
  ContextCardActorReference,
  ContextCardActorSummary,
} from "@/lib/context-card-actor";
import { getHistoricalContextCardActorId } from "@/lib/context-card-actor";
import {
  buildProjectPrincipalWhere,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import {
  mapTaskPersonSummary,
  taskPersonSummarySelect,
  type TaskPersonRecord,
} from "@/lib/task-person";

export const contextCardActorUserSelect = taskPersonSummarySelect;

export const contextCardActorCredentialSelect = {
  id: true,
  label: true,
  projectId: true,
  revokedAt: true,
  expiresAt: true,
} as const;

export interface ContextCardActorCredentialRecord {
  id: string;
  label: string;
  projectId: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export interface ContextCardActorRegistry {
  activeHumanIds: Set<string>;
  humanById: Map<string, ContextCardActorSummary>;
  credentialById: Map<string, ContextCardActorSummary>;
  assignable: ContextCardActorSummary[];
}

export interface ResolvedContextCardActorPersistence {
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  summary: ContextCardActorSummary;
}

interface RlsSafeContextCardActorRow {
  kind: "human" | "agent";
  actorId: string;
  name: string | null;
  email: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  avatarSeed: string | null;
  label: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

interface ActorResolutionError {
  ok: false;
  status: number;
  error: string;
}

interface ActorResolutionSuccess {
  ok: true;
  actor: ResolvedContextCardActorPersistence;
}

export type ContextCardActorResolution =
  | ActorResolutionError
  | ActorResolutionSuccess;

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapHuman(
  user: TaskPersonRecord,
  status: "active" | "inactive"
): ContextCardActorSummary {
  const person = mapTaskPersonSummary(user);
  if (!person) {
    throw new Error("context-card-human-identity-invalid");
  }

  return {
    kind: "human",
    id: person.id,
    displayName: person.displayName,
    usernameTag: person.usernameTag,
    avatarSeed: person.avatarSeed,
    status,
    isAssignable: status === "active",
  };
}

function mapCredential(
  credential: ContextCardActorCredentialRecord,
  now: Date
): ContextCardActorSummary {
  const status = resolveAgentCredentialStatus({
    revokedAt: credential.revokedAt,
    expiresAt: credential.expiresAt,
    now,
  });

  return {
    kind: "agent",
    id: credential.id,
    displayName: credential.label,
    usernameTag: null,
    avatarSeed: null,
    status,
    isAssignable: status === "active",
  };
}

export function mapStoredContextCardActor(input: {
  kind: "human" | "agent";
  id: string | null;
  displayNameSnapshot: string | null;
  user?: TaskPersonRecord | null;
  credential?: ContextCardActorCredentialRecord | null;
  isCurrentProjectHuman?: boolean;
  now?: Date;
}): ContextCardActorSummary | null {
  const id = normalizeIdentifier(input.id);
  const snapshot = normalizeIdentifier(input.displayNameSnapshot);
  if (!id && !snapshot) {
    return null;
  }

  if (input.kind === "human") {
    if (input.user && id) {
      return mapHuman(
        input.user,
        input.isCurrentProjectHuman ? "active" : "inactive"
      );
    }
    return {
      kind: "human",
      id:
        id ||
        getHistoricalContextCardActorId({
          kind: "human",
          displayNameSnapshot: snapshot,
        }),
      displayName: snapshot || "Former project member",
      usernameTag: null,
      avatarSeed: null,
      status: "inactive",
      isAssignable: false,
    };
  }

  if (input.credential && id) {
    return mapCredential(input.credential, input.now ?? new Date());
  }
  return {
    kind: "agent",
    id:
      id ||
      getHistoricalContextCardActorId({
        kind: "agent",
        displayNameSnapshot: snapshot,
      }),
    displayName: snapshot || "Former project agent",
    usernameTag: null,
    avatarSeed: null,
    status: "revoked",
    isAssignable: false,
  };
}

export async function loadContextCardActorRegistry(input: {
  db: DbClient;
  projectId: string;
  now?: Date;
}): Promise<ContextCardActorRegistry | null> {
  const rows = await input.db.$queryRaw<RlsSafeContextCardActorRow[]>(Prisma.sql`
    SELECT *
    FROM app.list_project_context_card_actors(${input.projectId})
  `);
  if (rows.length === 0) {
    return null;
  }

  const activeHumanIds = new Set<string>();
  const humanById = new Map<string, ContextCardActorSummary>();
  const credentialById = new Map<string, ContextCardActorSummary>();

  const now = input.now ?? new Date();
  for (const row of rows) {
    if (row.kind === "human") {
      if (activeHumanIds.has(row.actorId)) {
        continue;
      }
      const user = {
        id: row.actorId,
        name: row.name,
        email: row.email,
        username: row.username,
        usernameDiscriminator: row.usernameDiscriminator,
        avatarSeed: row.avatarSeed,
      };
      activeHumanIds.add(row.actorId);
      humanById.set(row.actorId, mapHuman(user, "active"));
      continue;
    }

    credentialById.set(
      row.actorId,
      mapCredential(
        {
          id: row.actorId,
          label: row.label ?? "Project agent",
          projectId: input.projectId,
          revokedAt: row.revokedAt,
          expiresAt: row.expiresAt,
        },
        now
      )
    );
  }

  const assignable = [
    ...humanById.values(),
    ...credentialById.values(),
  ].filter((actor) => actor.isAssignable);

  return { activeHumanIds, humanById, credentialById, assignable };
}

export async function listProjectContextCardActors(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ContextCardActorSummary[]> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId || !projectId) {
    return [];
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        ...buildProjectPrincipalWhere(actorUserId),
      },
      select: { id: true },
    });
    if (!project) {
      return [];
    }

    const registry = await loadContextCardActorRegistry({ db, projectId });
    return registry?.assignable ?? [];
  }) as Promise<ContextCardActorSummary[]>;
}

export async function resolveAssignableContextCardActor(input: {
  db: DbClient;
  projectId: string;
  reference: ContextCardActorReference;
  now?: Date;
}): Promise<ContextCardActorResolution> {
  const registry = await loadContextCardActorRegistry({
    db: input.db,
    projectId: input.projectId,
    now: input.now,
  });
  return resolveAssignableContextCardActorFromRegistry({
    registry,
    reference: input.reference,
  });
}

export function resolveAssignableContextCardActorFromRegistry(input: {
  registry: ContextCardActorRegistry | null;
  reference: ContextCardActorReference;
}): ContextCardActorResolution {
  const actor =
    input.reference.kind === "human"
      ? input.registry?.humanById.get(input.reference.id)
      : input.registry?.credentialById.get(input.reference.id);
  if (!actor?.isAssignable) {
    return {
      ok: false,
      status: 400,
      error: "context-card-steward-invalid",
    };
  }

  return {
    ok: true,
    actor: {
      userId: actor.kind === "human" ? actor.id : null,
      credentialId: actor.kind === "agent" ? actor.id : null,
      displayNameSnapshot: actor.displayName,
      summary: actor,
    },
  };
}

export async function resolveContextCardMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ContextCardActorResolution> {
  if (input.agentAccess) {
    const credential = await input.db.apiCredential.findFirst({
      where: {
        id: input.agentAccess.credentialId,
        projectId: input.projectId,
      },
      select: contextCardActorCredentialSelect,
    });
    if (!credential) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    const summary = mapCredential(credential, new Date());
    if (!summary.isAssignable) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return {
      ok: true,
      actor: {
        userId: null,
        credentialId: summary.id,
        displayNameSnapshot: summary.displayName,
        summary,
      },
    };
  }

  const access = await requireProjectRole({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    minimumRole: "viewer",
    db: input.db,
  });
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }

  const user = await input.db.user.findUnique({
    where: { id: input.actorUserId },
    select: contextCardActorUserSelect,
  });
  if (!user) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const summary = mapHuman(user, "active");
  return {
    ok: true,
    actor: {
      userId: summary.id,
      credentialId: null,
      displayNameSnapshot: summary.displayName,
      summary,
    },
  };
}
