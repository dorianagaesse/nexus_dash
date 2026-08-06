import { resolveAgentCredentialStatus } from "@/lib/agent-access";
import type {
  MeetingTodoActorReference,
  MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
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

export const meetingTodoActorUserSelect = taskPersonSummarySelect;

export const meetingTodoActorCredentialSelect = {
  id: true,
  label: true,
  projectId: true,
  revokedAt: true,
  expiresAt: true,
} as const;

export interface MeetingTodoActorCredentialRecord {
  id: string;
  label: string;
  projectId: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export interface MeetingTodoActorRegistry {
  activeHumanIds: Set<string>;
  humanById: Map<string, MeetingTodoActorSummary>;
  credentialById: Map<string, MeetingTodoActorSummary>;
  assignable: MeetingTodoActorSummary[];
}

export interface ResolvedMeetingTodoActorPersistence {
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  summary: MeetingTodoActorSummary;
}

interface ActorResolutionError {
  ok: false;
  status: number;
  error: string;
}

interface ActorResolutionSuccess {
  ok: true;
  actor: ResolvedMeetingTodoActorPersistence;
}

export type MeetingTodoActorResolution =
  | ActorResolutionError
  | ActorResolutionSuccess;

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapHuman(
  user: TaskPersonRecord,
  status: "active" | "inactive"
): MeetingTodoActorSummary {
  const person = mapTaskPersonSummary(user);
  if (!person) {
    throw new Error("meeting-todo-human-identity-invalid");
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
  credential: MeetingTodoActorCredentialRecord,
  now: Date
): MeetingTodoActorSummary {
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

export function mapStoredMeetingTodoActor(input: {
  kind: "human" | "agent";
  id: string | null;
  displayNameSnapshot: string | null;
  user?: TaskPersonRecord | null;
  credential?: MeetingTodoActorCredentialRecord | null;
  isCurrentProjectHuman?: boolean;
  now?: Date;
}): MeetingTodoActorSummary | null {
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
      id,
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
    id,
    displayName: snapshot || "Former project agent",
    usernameTag: null,
    avatarSeed: null,
    status: "revoked",
    isAssignable: false,
  };
}

export async function loadMeetingTodoActorRegistry(input: {
  db: DbClient;
  projectId: string;
  now?: Date;
}): Promise<MeetingTodoActorRegistry | null> {
  const project = await input.db.project.findUnique({
    where: { id: input.projectId },
    select: {
      owner: { select: meetingTodoActorUserSelect },
      memberships: {
        orderBy: [{ createdAt: "asc" }],
        select: { user: { select: meetingTodoActorUserSelect } },
      },
      apiCredentials: {
        orderBy: [{ label: "asc" }, { createdAt: "asc" }],
        select: meetingTodoActorCredentialSelect,
      },
    },
  });
  if (!project) {
    return null;
  }

  const activeHumanIds = new Set<string>();
  const humanById = new Map<string, MeetingTodoActorSummary>();
  const credentialById = new Map<string, MeetingTodoActorSummary>();

  for (const user of [project.owner, ...project.memberships.map((item) => item.user)]) {
    if (activeHumanIds.has(user.id)) {
      continue;
    }
    activeHumanIds.add(user.id);
    humanById.set(user.id, mapHuman(user, "active"));
  }

  const now = input.now ?? new Date();
  for (const credential of project.apiCredentials) {
    credentialById.set(credential.id, mapCredential(credential, now));
  }

  const assignable = [
    ...humanById.values(),
    ...credentialById.values(),
  ].filter((actor) => actor.isAssignable);

  return { activeHumanIds, humanById, credentialById, assignable };
}

export async function listProjectMeetingTodoActors(input: {
  actorUserId: string;
  projectId: string;
}): Promise<MeetingTodoActorSummary[]> {
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

    const registry = await loadMeetingTodoActorRegistry({ db, projectId });
    return registry?.assignable ?? [];
  }) as Promise<MeetingTodoActorSummary[]>;
}

export async function resolveAssignableMeetingTodoActor(input: {
  db: DbClient;
  projectId: string;
  reference: MeetingTodoActorReference;
  now?: Date;
}): Promise<MeetingTodoActorResolution> {
  const registry = await loadMeetingTodoActorRegistry({
    db: input.db,
    projectId: input.projectId,
    now: input.now,
  });
  return resolveAssignableMeetingTodoActorFromRegistry({
    registry,
    reference: input.reference,
  });
}

export function resolveAssignableMeetingTodoActorFromRegistry(input: {
  registry: MeetingTodoActorRegistry | null;
  reference: MeetingTodoActorReference;
}): MeetingTodoActorResolution {
  const actor =
    input.reference.kind === "human"
      ? input.registry?.humanById.get(input.reference.id)
      : input.registry?.credentialById.get(input.reference.id);
  if (!actor?.isAssignable) {
    return { ok: false, status: 400, error: "meeting-note-action-assignee-invalid" };
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

export async function resolveMeetingTodoMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<MeetingTodoActorResolution> {
  if (input.agentAccess) {
    const credential = await input.db.apiCredential.findFirst({
      where: {
        id: input.agentAccess.credentialId,
        projectId: input.projectId,
      },
      select: meetingTodoActorCredentialSelect,
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
    select: meetingTodoActorUserSelect,
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
