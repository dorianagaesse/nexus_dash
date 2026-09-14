import type { ContextCardActorSummary } from "@/lib/context-card-actor";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import {
  loadProjectActorRegistry,
  mapStoredProjectActor,
  projectActorCredentialSelect,
  projectActorUserSelect,
  resolveProjectMutationActor,
  type ProjectActorCredentialRecord,
  type ProjectActorRegistry,
  type ProjectActorResolution,
} from "@/lib/services/project-actor-service";
import type { DbClient } from "@/lib/services/rls-context";
import type { TaskPersonRecord } from "@/lib/task-person";

const CONTEXT_CARD_HUMAN_IDENTITY_INVALID =
  "context-card-human-identity-invalid";

export const contextCardActorUserSelect = projectActorUserSelect;

export const contextCardActorCredentialSelect = projectActorCredentialSelect;

type ContextCardActorCredentialRecord = ProjectActorCredentialRecord;

export type ContextCardActorRegistry = ProjectActorRegistry;

export type ContextCardActorResolution = ProjectActorResolution;

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
  return loadProjectActorRegistry(input);
}

export async function resolveContextCardMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ContextCardActorResolution> {
  return resolveProjectMutationActor(input);
}
