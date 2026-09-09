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

export interface ProjectActorRegistry {
  activeHumanIds: Set<string>;
  humanById: Map<string, ProjectActorSummary>;
  credentialById: Map<string, ProjectActorSummary>;
  assignable: ProjectActorSummary[];
}

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
