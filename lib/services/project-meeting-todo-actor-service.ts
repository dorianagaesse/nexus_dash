import {
  buildExternalParticipantMeetingTodoActor,
  getMeetingTodoParticipantNameKey,
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import {
  listProjectActors,
  loadProjectActorRegistry,
  mapStoredProjectActor,
  projectActorCredentialSelect,
  projectActorUserSelect,
  resolveAssignableProjectActor,
  resolveAssignableProjectActorFromRegistry,
  resolveProjectMutationActor,
  type ProjectActorCredentialRecord,
  type ProjectActorRegistry,
} from "@/lib/services/project-actor-service";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import type { DbClient } from "@/lib/services/rls-context";
import type { TaskPersonRecord } from "@/lib/task-person";

const MEETING_TODO_ASSIGNEE_INVALID = "meeting-note-action-assignee-invalid";
const MEETING_TODO_HUMAN_IDENTITY_INVALID =
  "meeting-todo-human-identity-invalid";

export const meetingTodoActorUserSelect = projectActorUserSelect;

export const meetingTodoActorCredentialSelect = projectActorCredentialSelect;

export type MeetingTodoActorCredentialRecord = ProjectActorCredentialRecord;

export type MeetingTodoActorRegistry = ProjectActorRegistry;

export interface ResolvedMeetingTodoActorPersistence {
  userId: string | null;
  credentialId: string | null;
  displayNameSnapshot: string;
  summary: MeetingTodoActorSummary;
}

interface MeetingTodoActorResolutionError {
  ok: false;
  status: number;
  error: string;
}

interface MeetingTodoActorResolutionSuccess {
  ok: true;
  actor: ResolvedMeetingTodoActorPersistence;
}

export type MeetingTodoActorResolution =
  | MeetingTodoActorResolutionError
  | MeetingTodoActorResolutionSuccess;

export function mapStoredMeetingTodoActor(input: {
  kind: "human" | "agent" | "participant";
  id: string | null;
  displayNameSnapshot: string | null;
  user?: TaskPersonRecord | null;
  credential?: MeetingTodoActorCredentialRecord | null;
  isCurrentProjectHuman?: boolean;
  noteExternalParticipantNameKeys?: Set<string> | null;
  now?: Date;
}): MeetingTodoActorSummary | null {
  if (input.kind === "participant") {
    const snapshot = input.displayNameSnapshot?.trim() ?? "";
    if (!snapshot) {
      return null;
    }
    return buildExternalParticipantMeetingTodoActor({
      displayName: snapshot,
      isCurrentParticipant:
        Boolean(snapshot) &&
        Boolean(
          input.noteExternalParticipantNameKeys?.has(
            getMeetingTodoParticipantNameKey(snapshot)
          )
        ),
    });
  }

  return mapStoredProjectActor(
    {
      kind: input.kind,
      id: input.id,
      displayNameSnapshot: input.displayNameSnapshot,
      user: input.user,
      credential: input.credential,
      isCurrentProjectHuman: input.isCurrentProjectHuman,
      now: input.now,
    },
    MEETING_TODO_HUMAN_IDENTITY_INVALID
  );
}

export async function loadMeetingTodoActorRegistry(input: {
  db: DbClient;
  projectId: string;
  now?: Date;
}): Promise<MeetingTodoActorRegistry | null> {
  return loadProjectActorRegistry(input);
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
  if (input.reference.kind === "participant") {
    return { ok: false, status: 400, error: MEETING_TODO_ASSIGNEE_INVALID };
  }
  return resolveAssignableProjectActor(
    {
      db: input.db,
      projectId: input.projectId,
      reference: {
        kind: input.reference.kind,
        id: input.reference.id,
      },
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
  if (input.reference.kind === "participant") {
    return { ok: false, status: 400, error: MEETING_TODO_ASSIGNEE_INVALID };
  }
  return resolveAssignableProjectActorFromRegistry({
    registry: input.registry,
    reference: {
      kind: input.reference.kind,
      id: input.reference.id,
    },
    assigneeInvalidError: MEETING_TODO_ASSIGNEE_INVALID,
  });
}

export function resolveExternalParticipantMeetingTodoActor(input: {
  reference: MeetingTodoActorReference;
  participants: Array<{ userId: string | null; displayName: string }>;
}): MeetingTodoActorResolution {
  if (input.reference.kind !== "participant") {
    return {
      ok: false,
      status: 400,
      error: "meeting-note-action-assignee-invalid",
    };
  }

  const requestedKey = getMeetingTodoParticipantNameKey(input.reference.id);
  const participant = input.participants.find(
    (entry) =>
      entry.userId === null &&
      getMeetingTodoParticipantNameKey(entry.displayName) === requestedKey
  );
  if (!participant) {
    return {
      ok: false,
      status: 400,
      error: "meeting-note-action-assignee-invalid",
    };
  }

  const summary = buildExternalParticipantMeetingTodoActor({
    displayName: participant.displayName,
    isCurrentParticipant: true,
  });
  return {
    ok: true,
    actor: {
      userId: null,
      credentialId: null,
      displayNameSnapshot: participant.displayName,
      summary,
    },
  };
}

export async function resolveMeetingTodoMutationActor(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<MeetingTodoActorResolution> {
  return resolveProjectMutationActor(input);
}
