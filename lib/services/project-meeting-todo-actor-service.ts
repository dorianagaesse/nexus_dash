import type {
  MeetingTodoActorReference,
  MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
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

const MEETING_TODO_ASSIGNEE_INVALID = "meeting-note-action-assignee-invalid";
const MEETING_TODO_HUMAN_IDENTITY_INVALID =
  "meeting-todo-human-identity-invalid";

export const meetingTodoActorUserSelect = projectActorUserSelect;

export const meetingTodoActorCredentialSelect = projectActorCredentialSelect;

export type MeetingTodoActorCredentialRecord = ProjectActorCredentialRecord;

export type MeetingTodoActorRegistry = ProjectActorRegistry;

export type ResolvedMeetingTodoActorPersistence =
  ResolvedProjectActorPersistence;

export type MeetingTodoActorResolution = ProjectActorResolution;

export function mapStoredMeetingTodoActor(input: {
  kind: "human" | "agent";
  id: string | null;
  displayNameSnapshot: string | null;
  user?: TaskPersonRecord | null;
  credential?: MeetingTodoActorCredentialRecord | null;
  isCurrentProjectHuman?: boolean;
  now?: Date;
}): MeetingTodoActorSummary | null {
  return mapStoredProjectActor(input, MEETING_TODO_HUMAN_IDENTITY_INVALID);
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

  return buildProjectActorRegistry({
    humans: [
      project.owner,
      ...project.memberships.map((item) => item.user),
    ],
    credentials: project.apiCredentials,
    now: input.now,
  });
}

export async function listProjectMeetingTodoActors(input: {
  actorUserId: string;
  projectId: string;
}): Promise<MeetingTodoActorSummary[]> {
  return listProjectActors({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    loadRegistry: ({ db, projectId }) =>
      loadMeetingTodoActorRegistry({ db, projectId }),
  });
}

export async function resolveAssignableMeetingTodoActor(input: {
  db: DbClient;
  projectId: string;
  reference: MeetingTodoActorReference;
  now?: Date;
}): Promise<MeetingTodoActorResolution> {
  return resolveAssignableProjectActor(
    {
      db: input.db,
      projectId: input.projectId,
      reference: input.reference,
      now: input.now,
      loadRegistry: ({ db, projectId, now }) =>
        loadMeetingTodoActorRegistry({ db, projectId, now }),
    },
    MEETING_TODO_ASSIGNEE_INVALID
  );
}

export function resolveAssignableMeetingTodoActorFromRegistry(input: {
  registry: MeetingTodoActorRegistry | null;
  reference: MeetingTodoActorReference;
}): MeetingTodoActorResolution {
  return resolveAssignableProjectActorFromRegistry({
    registry: input.registry,
    reference: input.reference,
    assigneeInvalidError: MEETING_TODO_ASSIGNEE_INVALID,
  });
}

export async function resolveMeetingTodoMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<MeetingTodoActorResolution> {
  return resolveProjectMutationActor(input);
}
