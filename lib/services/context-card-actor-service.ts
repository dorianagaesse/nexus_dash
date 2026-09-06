import { Prisma } from "@prisma/client";

import type {
  ContextCardActorReference,
  ContextCardActorSummary,
} from "@/lib/context-card-actor";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import {
  buildProjectActorRegistry,
  listProjectActors,
  mapStoredProjectActor,
  projectActorCredentialSelect,
  projectActorUserSelect,
  resolveAssignableProjectActor,
  resolveAssignableProjectActorFromRegistry,
  resolveProjectMutationActor,
  type ProjectActorCredentialRecord,
  type ProjectActorRegistry,
  type ProjectActorResolution,
  type ResolvedProjectActorPersistence,
} from "@/lib/services/project-actor-service";
import type { DbClient } from "@/lib/services/rls-context";
import type { TaskPersonRecord } from "@/lib/task-person";

const CONTEXT_CARD_STEWARD_INVALID = "context-card-steward-invalid";
const CONTEXT_CARD_HUMAN_IDENTITY_INVALID =
  "context-card-human-identity-invalid";

export const contextCardActorUserSelect = projectActorUserSelect;

export const contextCardActorCredentialSelect = projectActorCredentialSelect;

export type ContextCardActorCredentialRecord = ProjectActorCredentialRecord;

export type ContextCardActorRegistry = ProjectActorRegistry;

export type ResolvedContextCardActorPersistence =
  ResolvedProjectActorPersistence;

export type ContextCardActorResolution = ProjectActorResolution;

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

export function mapStoredContextCardActor(input: {
  kind: "human" | "agent";
  id: string | null;
  displayNameSnapshot: string | null;
  user?: TaskPersonRecord | null;
  credential?: ContextCardActorCredentialRecord | null;
  isCurrentProjectHuman?: boolean;
  now?: Date;
}): ContextCardActorSummary | null {
  return mapStoredProjectActor(input, CONTEXT_CARD_HUMAN_IDENTITY_INVALID);
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

export async function listProjectContextCardActors(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ContextCardActorSummary[]> {
  return listProjectActors({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    loadRegistry: ({ db, projectId }) =>
      loadContextCardActorRegistry({ db, projectId }),
  });
}

export async function resolveAssignableContextCardActor(input: {
  db: DbClient;
  projectId: string;
  reference: ContextCardActorReference;
  now?: Date;
}): Promise<ContextCardActorResolution> {
  return resolveAssignableProjectActor(
    {
      db: input.db,
      projectId: input.projectId,
      reference: input.reference,
      now: input.now,
      loadRegistry: ({ db, projectId, now }) =>
        loadContextCardActorRegistry({ db, projectId, now }),
    },
    CONTEXT_CARD_STEWARD_INVALID
  );
}

export function resolveAssignableContextCardActorFromRegistry(input: {
  registry: ContextCardActorRegistry | null;
  reference: ContextCardActorReference;
}): ContextCardActorResolution {
  return resolveAssignableProjectActorFromRegistry({
    registry: input.registry,
    reference: input.reference,
    assigneeInvalidError: CONTEXT_CARD_STEWARD_INVALID,
  });
}

export async function resolveContextCardMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ContextCardActorResolution> {
  return resolveProjectMutationActor(input);
}
