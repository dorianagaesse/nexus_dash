import { Prisma, type ProjectMembershipRole } from "@prisma/client";

import { resolveAgentCredentialStatus } from "@/lib/agent-access";
import type {
  ProjectActorReference,
  ProjectActorSummary,
} from "@/lib/project-actor";
import { getHistoricalProjectActorId } from "@/lib/project-actor";
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

export const projectActorUserSelect = taskPersonSummarySelect;

export const projectActorCredentialSelect = {
  id: true,
  label: true,
  projectId: true,
  revokedAt: true,
  expiresAt: true,
} as const;

export interface ProjectActorCredentialRecord {
  id: string;
  label: string;
  projectId: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

interface RlsSafeProjectActorRow {
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

export interface ProjectActorRegistry {
  activeHumanIds: Set<string>;
  humanById: Map<string, ProjectActorSummary>;
  credentialById: Map<string, ProjectActorSummary>;
  assignable: ProjectActorSummary[];
}

export interface ProjectActorSearchResult extends ProjectActorSummary {
  projectRole: ProjectMembershipRole | null;
  isOwner: boolean;
}

type ProjectActorSearchResponse =
  | {
      ok: true;
      status: 200;
      data: { actors: ProjectActorSearchResult[] };
    }
  | { ok: false; status: number; error: string };

const PROJECT_ACTOR_SEARCH_LIMIT = 12;
export interface ResolvedProjectActorPersistence {
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  summary: ProjectActorSummary;
}

interface ActorResolutionError {
  ok: false;
  status: number;
  error: string;
}

interface ActorResolutionSuccess {
  ok: true;
  actor: ResolvedProjectActorPersistence;
}

export type ProjectActorResolution =
  | ActorResolutionError
  | ActorResolutionSuccess;

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function mapProjectActorHuman(
  user: TaskPersonRecord,
  status: "active" | "inactive",
  humanIdentityInvalidError = "project-actor-human-identity-invalid"
): ProjectActorSummary {
  const person = mapTaskPersonSummary(user);
  if (!person) {
    throw new Error(humanIdentityInvalidError);
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

export function mapProjectActorCredential(
  credential: ProjectActorCredentialRecord,
  now: Date
): ProjectActorSummary {
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

export function mapStoredProjectActor(
  input: {
    kind: "human" | "agent";
    id: string | null;
    displayNameSnapshot: string | null;
    user?: TaskPersonRecord | null;
    credential?: ProjectActorCredentialRecord | null;
    isCurrentProjectHuman?: boolean;
    now?: Date;
  },
  humanIdentityInvalidError = "project-actor-human-identity-invalid"
): ProjectActorSummary | null {
  const id = normalizeIdentifier(input.id);
  const snapshot = normalizeIdentifier(input.displayNameSnapshot);
  if (!id && !snapshot) {
    return null;
  }

  if (input.kind === "human") {
    if (input.user && id) {
      return mapProjectActorHuman(
        input.user,
        input.isCurrentProjectHuman ? "active" : "inactive",
        humanIdentityInvalidError
      );
    }
    return {
      kind: "human",
      id:
        id ||
        getHistoricalProjectActorId({
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
    return mapProjectActorCredential(input.credential, input.now ?? new Date());
  }
  return {
    kind: "agent",
    id:
      id ||
      getHistoricalProjectActorId({
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

// Stored actor rows resolve against the registry so project members without
// ApiCredential read access still get live credential status; registry misses
// fall back to the durable snapshot with a non-assignable status.
export function mapStoredProjectActorFromRegistry(
  input: {
    kind: "human" | "agent";
    id: string | null;
    displayNameSnapshot: string | null;
    user?: TaskPersonRecord | null;
    registry: ProjectActorRegistry | null;
  },
  humanIdentityInvalidError = "project-actor-human-identity-invalid"
): ProjectActorSummary | null {
  if (input.kind === "agent") {
    const credentialSummary = input.id
      ? input.registry?.credentialById.get(input.id) ?? null
      : null;
    if (credentialSummary) {
      return credentialSummary;
    }
  }

  return mapStoredProjectActor(
    {
      kind: input.kind,
      id: input.id,
      displayNameSnapshot: input.displayNameSnapshot,
      user: input.user,
      credential: null,
      isCurrentProjectHuman: Boolean(
        input.id && input.registry?.activeHumanIds.has(input.id)
      ),
    },
    humanIdentityInvalidError
  );
}

export function buildProjectActorRegistry(input: {
  humans: TaskPersonRecord[];
  credentials: ProjectActorCredentialRecord[];
  now?: Date;
}): ProjectActorRegistry {
  const activeHumanIds = new Set<string>();
  const humanById = new Map<string, ProjectActorSummary>();
  const credentialById = new Map<string, ProjectActorSummary>();

  for (const user of input.humans) {
    if (activeHumanIds.has(user.id)) {
      continue;
    }
    activeHumanIds.add(user.id);
    humanById.set(user.id, mapProjectActorHuman(user, "active"));
  }

  const now = input.now ?? new Date();
  for (const credential of input.credentials) {
    credentialById.set(credential.id, mapProjectActorCredential(credential, now));
  }

  const assignable = [
    ...humanById.values(),
    ...credentialById.values(),
  ].filter((actor) => actor.isAssignable);

  return { activeHumanIds, humanById, credentialById, assignable };
}

export async function loadProjectActorRegistry(input: {
  db: DbClient;
  projectId: string;
  now?: Date;
}): Promise<ProjectActorRegistry | null> {
  const rows = await input.db.$queryRaw<RlsSafeProjectActorRow[]>(Prisma.sql`
    SELECT *
    FROM app.list_project_actors(${input.projectId})
  `);
  if (rows.length === 0) {
    return null;
  }

  const humans: TaskPersonRecord[] = [];
  const credentials: ProjectActorCredentialRecord[] = [];
  for (const row of rows) {
    if (row.kind === "human") {
      humans.push({
        id: row.actorId,
        name: row.name,
        email: row.email,
        username: row.username,
        usernameDiscriminator: row.usernameDiscriminator,
        avatarSeed: row.avatarSeed,
      });
      continue;
    }
    credentials.push({
      id: row.actorId,
      label: row.label ?? "Project agent",
      projectId: input.projectId,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
    });
  }

  return buildProjectActorRegistry({
    humans,
    credentials,
    now: input.now,
  });
}

export async function loadProjectActorRegistryForActor(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ProjectActorRegistry | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId || !projectId) {
    return null;
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
      return null;
    }

    return loadProjectActorRegistry({ db, projectId });
  });
}

function projectActorSearchScore(
  actor: ProjectActorSearchResult,
  normalizedQuery: string
): number {
  if (!normalizedQuery) {
    return 2;
  }

  const displayName = actor.displayName.toLowerCase();
  const usernameTag = actor.usernameTag?.toLowerCase() ?? "";
  if (displayName === normalizedQuery || usernameTag === normalizedQuery) {
    return 0;
  }
  if (
    displayName.startsWith(normalizedQuery) ||
    usernameTag.startsWith(normalizedQuery)
  ) {
    return 1;
  }
  return 2;
}

export async function searchProjectActors(input: {
  actorUserId: string;
  agentAccess?: AgentProjectAccessContext;
  projectId: string;
  query: string;
  now?: Date;
}): Promise<ProjectActorSearchResponse> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!projectId) {
    return { ok: false, status: 404, error: "project-not-found" };
  }

  if (input.agentAccess) {
    if (input.agentAccess.projectId !== projectId) {
      return { ok: false, status: 404, error: "project-not-found" };
    }
    if (
      !input.agentAccess.scopes.some((scope) =>
        ["project:read", "task:read", "task:write"].includes(scope)
      )
    ) {
      return { ok: false, status: 403, error: "forbidden" };
    }
  }

  const normalizedQuery = normalizeIdentifier(input.query)
    .replace(/^@/, "")
    .toLowerCase();
  const queryWithoutDiscriminator =
    normalizedQuery.split("#", 1)[0] ?? normalizedQuery;

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return access;
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        owner: { select: projectActorUserSelect },
        memberships: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            role: true,
            user: { select: projectActorUserSelect },
          },
        },
      },
    });
    if (!project) {
      return { ok: false as const, status: 404, error: "project-not-found" };
    }

    const roleByHumanId = new Map<string, ProjectMembershipRole>();
    roleByHumanId.set(project.owner.id, "owner");
    for (const membership of project.memberships) {
      if (!roleByHumanId.has(membership.user.id)) {
        roleByHumanId.set(membership.user.id, membership.role);
      }
    }

    const humans = [
      project.owner,
      ...project.memberships.map((membership) => membership.user),
    ];
    const emailByHumanId = new Map(
      humans.map((human) => [human.id, human.email?.toLowerCase() ?? ""])
    );
    const registry = await loadProjectActorRegistry({
      db,
      projectId,
      now: input.now,
    });
    if (!registry) {
      return { ok: false as const, status: 404, error: "project-not-found" };
    }

    const actors: ProjectActorSearchResult[] = registry.assignable
      .filter((actor) => {
        if (!input.agentAccess && actor.kind === "human" && actor.id === actorUserId) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        return (
          actor.displayName.toLowerCase().includes(normalizedQuery) ||
          actor.usernameTag?.toLowerCase().startsWith(queryWithoutDiscriminator) ||
          (actor.kind === "human" &&
            emailByHumanId.get(actor.id)?.includes(normalizedQuery))
        );
      })
      .map((actor) => ({
        ...actor,
        projectRole:
          actor.kind === "human" ? roleByHumanId.get(actor.id) ?? "viewer" : null,
        isOwner: actor.kind === "human" && actor.id === project.owner.id,
      }))
      .sort((left, right) => {
        const scoreDifference =
          projectActorSearchScore(left, normalizedQuery) -
          projectActorSearchScore(right, normalizedQuery);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        if (left.kind !== right.kind) {
          return left.kind === "human" ? -1 : 1;
        }
        return left.displayName.localeCompare(right.displayName);
      })
      .slice(0, PROJECT_ACTOR_SEARCH_LIMIT);

    return { ok: true as const, status: 200 as const, data: { actors } };
  });
}
export async function listProjectActors(input: {
  actorUserId: string;
  projectId: string;
  loadRegistry: (input: {
    db: DbClient;
    projectId: string;
  }) => Promise<ProjectActorRegistry | null>;
}): Promise<ProjectActorSummary[]> {
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

    const registry = await input.loadRegistry({ db, projectId });
    return registry?.assignable ?? [];
  }) as Promise<ProjectActorSummary[]>;
}

export async function resolveAssignableProjectActor(
  input: {
    db: DbClient;
    projectId: string;
    reference: ProjectActorReference;
    now?: Date;
    loadRegistry: (input: {
      db: DbClient;
      projectId: string;
      now?: Date;
    }) => Promise<ProjectActorRegistry | null>;
  },
  assigneeInvalidError: string
): Promise<ProjectActorResolution> {
  const registry = await input.loadRegistry({
    db: input.db,
    projectId: input.projectId,
    now: input.now,
  });
  return resolveAssignableProjectActorFromRegistry({
    registry,
    reference: input.reference,
    assigneeInvalidError,
  });
}

export function resolveAssignableProjectActorFromRegistry(input: {
  registry: ProjectActorRegistry | null;
  reference: ProjectActorReference;
  assigneeInvalidError: string;
}): ProjectActorResolution {
  const actor =
    input.reference.kind === "human"
      ? input.registry?.humanById.get(input.reference.id)
      : input.registry?.credentialById.get(input.reference.id);
  if (!actor?.isAssignable) {
    return { ok: false, status: 400, error: input.assigneeInvalidError };
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

export async function resolveProjectMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ProjectActorResolution> {
  if (input.agentAccess) {
    const credential = await input.db.apiCredential.findFirst({
      where: {
        id: input.agentAccess.credentialId,
        projectId: input.projectId,
      },
      select: projectActorCredentialSelect,
    });
    if (!credential) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    const summary = mapProjectActorCredential(credential, new Date());
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
    select: projectActorUserSelect,
  });
  if (!user) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const summary = mapProjectActorHuman(user, "active");
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
