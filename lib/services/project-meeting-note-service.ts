import { logServerError } from "@/lib/observability/logger";
import {
  normalizeMeetingParticipantName,
  type ProjectMeetingParticipantIdentity,
  type ProjectMeetingParticipantInput,
} from "@/lib/meeting-participant";
import {
  isMeetingTodoActorReference,
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  requireProjectRole,
  requireAgentProjectScopes,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import {
  loadMeetingTodoActorRegistry,
  mapStoredMeetingTodoActor,
  meetingTodoActorCredentialSelect,
  meetingTodoActorUserSelect,
  resolveAssignableMeetingTodoActorFromRegistry,
  resolveMeetingTodoMutationActor,
  type MeetingTodoActorCredentialRecord,
  type MeetingTodoActorRegistry,
  type ResolvedMeetingTodoActorPersistence,
} from "@/lib/services/project-meeting-todo-actor-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";
import {
  normalizeTaskLabels,
  parseTaskLabelsJson,
  serializeTaskLabels,
} from "@/lib/task-label";
import {
  mapTaskPersonSummary,
  taskPersonSummarySelect,
  type TaskPersonSummary,
  type TaskPersonRecord,
} from "@/lib/task-person";

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 140;
const MAX_PARTICIPANTS = 40;
const MAX_PARTICIPANT_LENGTH = 80;
const MAX_SECTION_LENGTH = 10000;
const MAX_ACTIONS = 40;
const MAX_ACTION_LENGTH = 240;

export const MEETING_NOTE_STATUSES = [
  "prepared",
  "actions_in_progress",
  "done",
] as const;

export type MeetingNoteStatus = (typeof MEETING_NOTE_STATUSES)[number];

const DEFAULT_MEETING_NOTE_STATUS: MeetingNoteStatus = "prepared";

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

export interface MeetingNoteActionInput {
  id?: string | null;
  content: string;
  completedAt?: Date | string | null;
  assignee?: MeetingTodoActorReference | null;
}

export interface MeetingNoteMutationInput {
  actorUserId: string;
  projectId: string;
  title: string;
  scheduledAt?: Date | string | null;
  participants?: Array<string | ProjectMeetingParticipantInput>;
  labels?: string[];
  status?: string | null;
  inputNotes?: string;
  outputNotes?: string;
  decisions?: string;
  actions?: MeetingNoteActionInput[];
  agentAccess?: AgentProjectAccessContext;
}

export interface MeetingNoteUpdateInput extends MeetingNoteMutationInput {
  noteId: string;
}

export interface ProjectMeetingNoteSummary {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: Date | null;
  participants: ProjectMeetingParticipantIdentity[];
  labels: string[];
  status: MeetingNoteStatus;
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  actions: ProjectMeetingNoteActionSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMeetingNoteActionSummary {
  id: string;
  content: string;
  completedAt: Date | null;
  position: number;
  creator: MeetingTodoActorSummary | null;
  assignee: MeetingTodoActorSummary | null;
  completedBy: MeetingTodoActorSummary | null;
}

export interface MeetingNoteActionCompletionInput {
  actorUserId: string;
  projectId: string;
  noteId: string;
  actionId: string;
  completed: boolean;
  agentAccess?: AgentProjectAccessContext;
}

export interface MeetingNoteActionAssigneeInput {
  actorUserId: string;
  projectId: string;
  noteId: string;
  actionId: string;
  assignee: MeetingTodoActorReference | null;
  agentAccess?: AgentProjectAccessContext;
}

type MeetingTodoStoredActorFields = {
  createdByUserId: string | null;
  createdByCredentialId: string | null;
  creatorKind: "human" | "agent";
  creatorDisplayNameSnapshot: string;
  createdByUser: TaskPersonRecord | null;
  createdByCredential: MeetingTodoActorCredentialRecord | null;
  assigneeUserId: string | null;
  assigneeCredentialId: string | null;
  assigneeKind: "human" | "agent" | null;
  assigneeDisplayNameSnapshot: string | null;
  assigneeUser: TaskPersonRecord | null;
  assigneeCredential: MeetingTodoActorCredentialRecord | null;
  completedByUserId: string | null;
  completedByCredentialId: string | null;
  completedByKind: "human" | "agent" | null;
  completedByDisplayNameSnapshot: string | null;
  completedByUser: TaskPersonRecord | null;
  completedByCredential: MeetingTodoActorCredentialRecord | null;
};

type MeetingNoteRecord = {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: Date | null;
  participants: Array<{
    userId: string | null;
    displayName: string;
    position: number;
    user: TaskPersonRecord | null;
  }>;
  labelsJson: string | null;
  status: string;
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  createdAt: Date;
  updatedAt: Date;
  actions: Array<MeetingTodoStoredActorFields & {
    id: string;
    content: string;
    completedAt: Date | null;
    position: number;
  }>;
};

const meetingTodoActionActorInclude = {
  createdByUser: { select: meetingTodoActorUserSelect },
  createdByCredential: { select: meetingTodoActorCredentialSelect },
  assigneeUser: { select: meetingTodoActorUserSelect },
  assigneeCredential: { select: meetingTodoActorCredentialSelect },
  completedByUser: { select: meetingTodoActorUserSelect },
  completedByCredential: { select: meetingTodoActorCredentialSelect },
} as const;

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeLongText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

interface NormalizedMeetingParticipantInput {
  userId: string | null;
  displayName: string;
}

function normalizeParticipants(
  value: Array<string | ProjectMeetingParticipantInput> | undefined
): NormalizedMeetingParticipantInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const participants: NormalizedMeetingParticipantInput[] = [];

  for (const entry of value) {
    const userId =
      typeof entry === "object" && entry
        ? normalizeText(entry.userId) || null
        : null;
    const displayName = normalizeMeetingParticipantName(
      typeof entry === "string" ? entry : entry?.displayName ?? ""
    );
    const key = userId
      ? `user:${userId}`
      : `external:${displayName.toLowerCase()}`;

    if ((!userId && !displayName) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    participants.push({ userId, displayName });
  }

  return participants;
}

function normalizeStatus(value: string | null | undefined): MeetingNoteStatus {
  if (!value) {
    return DEFAULT_MEETING_NOTE_STATUS;
  }

  return MEETING_NOTE_STATUSES.includes(value as MeetingNoteStatus)
    ? (value as MeetingNoteStatus)
    : DEFAULT_MEETING_NOTE_STATUS;
}

function normalizeScheduledAt(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeActionInputs(
  value: MeetingNoteActionInput[] | undefined
): Array<{
  id: string | null;
  content: string;
  completedAt: Date | null;
  position: number;
  assignee: MeetingTodoActorReference | null | undefined;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((action) => ({
      id: normalizeText(action.id) || null,
      content: normalizeText(action.content),
      completedAt: normalizeScheduledAt(action.completedAt ?? null),
      assignee:
        action.assignee === null
          ? null
          : isMeetingTodoActorReference(action.assignee)
            ? { kind: action.assignee.kind, id: action.assignee.id.trim() }
            : undefined,
    }))
    .filter((action) => action.content.length > 0)
    .map((action, index) => ({
      ...action,
      position: index,
    }));
}

function validateMeetingNoteDraft(input: {
  title: string;
  scheduledAtRaw: Date | string | null | undefined;
  scheduledAt: Date | null;
  participants: NormalizedMeetingParticipantInput[];
  labels: string[];
  status: MeetingNoteStatus;
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  actions: Array<{ id: string | null; content: string }>;
}): ServiceErrorResult | null {
  if (input.title.length < MIN_TITLE_LENGTH) {
    return createError(400, "meeting-note-title-too-short");
  }

  if (input.title.length > MAX_TITLE_LENGTH) {
    return createError(400, "meeting-note-title-too-long");
  }

  if (
    input.scheduledAtRaw != null &&
    input.scheduledAtRaw !== "" &&
    input.scheduledAt === null
  ) {
    return createError(400, "meeting-note-scheduled-at-invalid");
  }

  if (input.participants.length > MAX_PARTICIPANTS) {
    return createError(400, "meeting-note-too-many-participants");
  }

  if (
    input.participants.some(
      (participant) =>
        participant.userId === null &&
        participant.displayName.length > MAX_PARTICIPANT_LENGTH
    )
  ) {
    return createError(400, "meeting-note-participant-too-long");
  }

  if (
    input.inputNotes.length > MAX_SECTION_LENGTH ||
    input.outputNotes.length > MAX_SECTION_LENGTH ||
    input.decisions.length > MAX_SECTION_LENGTH
  ) {
    return createError(400, "meeting-note-section-too-long");
  }

  if (input.actions.length > MAX_ACTIONS) {
    return createError(400, "meeting-note-too-many-actions");
  }

  if (input.actions.some((action) => action.content.length > MAX_ACTION_LENGTH)) {
    return createError(400, "meeting-note-action-too-long");
  }

  const actionIds = input.actions.flatMap((action) =>
    action.id ? [action.id] : []
  );
  if (new Set(actionIds).size !== actionIds.length) {
    return createError(400, "meeting-note-action-invalid");
  }

  return null;
}

function mapActionActor(input: {
  kind: "human" | "agent" | null;
  userId: string | null;
  credentialId: string | null;
  snapshot: string | null;
  user: TaskPersonRecord | null;
  credential: MeetingTodoActorCredentialRecord | null;
  registry: MeetingTodoActorRegistry | null;
}): MeetingTodoActorSummary | null {
  if (!input.kind) {
    return null;
  }
  return mapStoredMeetingTodoActor({
    kind: input.kind,
    id: input.kind === "human" ? input.userId : input.credentialId,
    displayNameSnapshot: input.snapshot,
    user: input.user,
    credential: input.credential,
    isCurrentProjectHuman:
      input.kind === "human" && Boolean(input.userId) &&
      Boolean(input.registry?.activeHumanIds.has(input.userId ?? "")),
  });
}

function mapMeetingNote(
  note: MeetingNoteRecord,
  registry: MeetingTodoActorRegistry | null
): ProjectMeetingNoteSummary {
  return {
    id: note.id,
    projectId: note.projectId,
    title: note.title,
    scheduledAt: note.scheduledAt,
    participants: note.participants
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((participant) => {
        const user = mapTaskPersonSummary(participant.user);
        return user
          ? {
              userId: user.id,
              displayName: user.displayName,
              usernameTag: user.usernameTag,
              avatarSeed: user.avatarSeed,
            }
          : {
              userId: null,
              displayName: participant.displayName,
              usernameTag: null,
              avatarSeed: null,
            };
      }),
    labels: parseTaskLabelsJson(note.labelsJson ?? ""),
    status: normalizeStatus(note.status),
    inputNotes: note.inputNotes,
    outputNotes: note.outputNotes,
    decisions: note.decisions,
    actions: note.actions
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((action) => ({
        id: action.id,
        content: action.content,
        completedAt: action.completedAt,
        position: action.position,
        creator: mapActionActor({
          kind: action.creatorKind,
          userId: action.createdByUserId,
          credentialId: action.createdByCredentialId,
          snapshot: action.creatorDisplayNameSnapshot,
          user: action.createdByUser,
          credential: action.createdByCredential,
          registry,
        }),
        assignee: mapActionActor({
          kind: action.assigneeKind,
          userId: action.assigneeUserId,
          credentialId: action.assigneeCredentialId,
          snapshot: action.assigneeDisplayNameSnapshot,
          user: action.assigneeUser,
          credential: action.assigneeCredential,
          registry,
        }),
        completedBy: mapActionActor({
          kind: action.completedByKind,
          userId: action.completedByUserId,
          credentialId: action.completedByCredentialId,
          snapshot: action.completedByDisplayNameSnapshot,
          user: action.completedByUser,
          credential: action.completedByCredential,
          registry,
        }),
      })),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function noteMatchesSearch(note: ProjectMeetingNoteSummary, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    note.title,
    ...note.participants.map((participant) => participant.displayName),
    ...note.labels,
    note.status,
    note.inputNotes,
    note.outputNotes,
    ...note.actions.map((action) => action.content),
  ]
    .join(" ")
    .toLocaleLowerCase();

  return haystack.includes(query.toLocaleLowerCase());
}

async function readMeetingNoteById(input: {
  db: DbClient;
  projectId: string;
  noteId: string;
}): Promise<ProjectMeetingNoteSummary | null> {
  const [note, registry] = await Promise.all([
    input.db.projectMeetingNote.findFirst({
    where: {
      id: input.noteId,
      projectId: input.projectId,
    },
    include: {
      participants: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          user: {
            select: taskPersonSummarySelect,
          },
        },
      },
      actions: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: meetingTodoActionActorInclude,
      },
    },
    }),
    loadMeetingTodoActorRegistry({
      db: input.db,
      projectId: input.projectId,
    }),
  ]);

  return note ? mapMeetingNote(note, registry) : null;
}

function buildDraft(input: MeetingNoteMutationInput) {
  const title = normalizeText(input.title);
  const scheduledAt = normalizeScheduledAt(input.scheduledAt ?? null);
  const participants = normalizeParticipants(input.participants);
  const labels = normalizeTaskLabels(input.labels ?? []);
  const status = normalizeStatus(input.status);
  const inputNotes = normalizeLongText(input.inputNotes);
  const outputNotes = normalizeLongText(input.outputNotes);
  const decisions = normalizeLongText(input.decisions);
  const actions = normalizeActionInputs(input.actions);

  return {
    title,
    scheduledAt,
    participants,
    labels,
    status,
    inputNotes,
    outputNotes,
    decisions,
    actions,
  };
}

type NormalizedMeetingAction = ReturnType<typeof normalizeActionInputs>[number];

function resolveDraftActionAssignees(input: {
  actions: NormalizedMeetingAction[];
  registry: MeetingTodoActorRegistry | null;
}):
  | {
      ok: true;
      assignments: Array<{
        assigneeKind: "human" | "agent" | null;
        assigneeUserId: string | null;
        assigneeCredentialId: string | null;
        assigneeDisplayNameSnapshot: string | null;
      } | undefined>;
    }
  | ServiceErrorResult {
  const assignments: Array<{
    assigneeKind: "human" | "agent" | null;
    assigneeUserId: string | null;
    assigneeCredentialId: string | null;
    assigneeDisplayNameSnapshot: string | null;
  } | undefined> = [];

  for (const action of input.actions) {
    if (action.assignee === undefined) {
      assignments.push(undefined);
      continue;
    }
    if (action.assignee === null) {
      assignments.push({
        assigneeKind: null,
        assigneeUserId: null,
        assigneeCredentialId: null,
        assigneeDisplayNameSnapshot: null,
      });
      continue;
    }

    const resolution = resolveAssignableMeetingTodoActorFromRegistry({
      registry: input.registry,
      reference: action.assignee,
    });
    if (!resolution.ok) {
      return createError(resolution.status, resolution.error);
    }
    assignments.push({
      assigneeKind: resolution.actor.summary.kind,
      assigneeUserId: resolution.actor.userId,
      assigneeCredentialId: resolution.actor.credentialId,
      assigneeDisplayNameSnapshot: resolution.actor.displayNameSnapshot,
    });
  }

  return { ok: true, assignments };
}

function buildCreatorPersistence(actor: ResolvedMeetingTodoActorPersistence) {
  return {
    creatorKind: actor.summary.kind,
    createdByUserId: actor.userId,
    createdByCredentialId: actor.credentialId,
    creatorDisplayNameSnapshot: actor.displayNameSnapshot,
  };
}

async function resolveMeetingParticipants(input: {
  db: DbClient;
  projectId: string;
  participants: NormalizedMeetingParticipantInput[];
}): Promise<
  | {
      ok: true;
      participants: Array<{
        userId: string | null;
        displayName: string;
        position: number;
      }>;
    }
  | ServiceErrorResult
> {
  const requestedUserIds = Array.from(
    new Set(
      input.participants.flatMap((participant) =>
        participant.userId ? [participant.userId] : []
      )
    )
  );

  const collaboratorById = new Map<string, TaskPersonSummary>();
  if (requestedUserIds.length > 0) {
    const project = await input.db.project.findFirst({
      where: { id: input.projectId },
      select: {
        owner: {
          select: taskPersonSummarySelect,
        },
        memberships: {
          where: {
            userId: { in: requestedUserIds },
          },
          select: {
            user: {
              select: taskPersonSummarySelect,
            },
          },
        },
      },
    });

    if (!project) {
      return createError(404, "meeting-note-not-found");
    }

    const owner = mapTaskPersonSummary(project.owner);
    if (owner) {
      collaboratorById.set(owner.id, owner);
    }
    for (const membership of project.memberships) {
      const collaborator = mapTaskPersonSummary(membership.user);
      if (collaborator) {
        collaboratorById.set(collaborator.id, collaborator);
      }
    }
  }

  const participants: Array<{
    userId: string | null;
    displayName: string;
    position: number;
  }> = [];

  for (const participant of input.participants) {
    if (!participant.userId) {
      participants.push({
        userId: null,
        displayName: participant.displayName,
        position: participants.length,
      });
      continue;
    }

    const collaborator = collaboratorById.get(participant.userId);
    if (!collaborator) {
      return createError(400, "meeting-note-participant-user-invalid");
    }

    participants.push({
      userId: collaborator.id,
      displayName: collaborator.displayName,
      position: participants.length,
    });
  }

  return { ok: true, participants };
}

export async function listProjectMeetingNotes(input: {
  actorUserId: string;
  projectId: string;
  query?: string | null;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ProjectMeetingNoteSummary[]> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return [];
  }

  if (input.agentAccess) {
    const agentScopeAccess = requireAgentProjectScopes({
      agentAccess: input.agentAccess,
      projectId: input.projectId,
      requiredScopes: ["task:read"],
    });
    if (!agentScopeAccess.ok) {
      return [];
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "viewer",
      db,
    });
    if (!access.ok) {
      return [];
    }

    const [notes, registry] = await Promise.all([
      db.projectMeetingNote.findMany({
      where: {
        projectId: input.projectId,
      },
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
      include: {
        participants: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: {
            user: {
              select: taskPersonSummarySelect,
            },
          },
        },
        actions: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: meetingTodoActionActorInclude,
        },
      },
      }),
      loadMeetingTodoActorRegistry({ db, projectId: input.projectId }),
    ]);

    const query = normalizeText(input.query).toLocaleLowerCase();
    return notes
      .map((note) => mapMeetingNote(note, registry))
      .filter((note) => noteMatchesSearch(note, query));
  }) as Promise<ProjectMeetingNoteSummary[]>;
}

export async function createProjectMeetingNote(
  input: MeetingNoteMutationInput
): Promise<ServiceResult<{ note: ProjectMeetingNoteSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const draft = buildDraft(input);
  const validationError = validateMeetingNoteDraft({
    ...draft,
    scheduledAtRaw: input.scheduledAt,
  });
  if (validationError) {
    return validationError;
  }

  if (input.agentAccess) {
    const agentScopeAccess = requireAgentProjectScopes({
      agentAccess: input.agentAccess,
      projectId: input.projectId,
      requiredScopes: ["task:write"],
    });
    if (!agentScopeAccess.ok) {
      return createError(agentScopeAccess.status, agentScopeAccess.error);
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const [participantResolution, mutationActor, actorRegistry] =
        await Promise.all([
          resolveMeetingParticipants({
            db,
            projectId: input.projectId,
            participants: draft.participants,
          }),
          resolveMeetingTodoMutationActor({
            db,
            actorUserId,
            projectId: input.projectId,
            agentAccess: input.agentAccess,
          }),
          loadMeetingTodoActorRegistry({ db, projectId: input.projectId }),
        ]);
      if (!participantResolution.ok) {
        return participantResolution;
      }
      if (!mutationActor.ok) {
        return createError(mutationActor.status, mutationActor.error);
      }
      const assignmentResolution = resolveDraftActionAssignees({
        actions: draft.actions,
        registry: actorRegistry,
      });
      if (!assignmentResolution.ok) {
        return assignmentResolution;
      }

      const created = await db.projectMeetingNote.create({
        data: {
          projectId: input.projectId,
          title: draft.title,
          scheduledAt: draft.scheduledAt,
          participants: {
            create: participantResolution.participants,
          },
          labelsJson: serializeTaskLabels(draft.labels),
          status: draft.status,
          inputNotes: draft.inputNotes,
          outputNotes: draft.outputNotes,
          decisions: draft.decisions,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          actions: {
            create: draft.actions.map((action, index) => ({
              content: action.content,
              completedAt: action.completedAt,
              position: action.position,
              ...buildCreatorPersistence(mutationActor.actor),
              ...(assignmentResolution.assignments[index] ?? {
                assigneeKind: null,
                assigneeUserId: null,
                assigneeCredentialId: null,
                assigneeDisplayNameSnapshot: null,
              }),
              ...(action.completedAt
                ? {
                    completedByKind: mutationActor.actor.summary.kind,
                    completedByUserId: mutationActor.actor.userId,
                    completedByCredentialId: mutationActor.actor.credentialId,
                    completedByDisplayNameSnapshot:
                      mutationActor.actor.displayNameSnapshot,
                  }
                : {}),
            })),
          },
        },
        select: { id: true },
      });

      const note = await readMeetingNoteById({
        db,
        projectId: input.projectId,
        noteId: created.id,
      });
      if (!note) {
        return createError(500, "meeting-note-create-failed");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: { note },
      };
    } catch (error) {
      logServerError("createProjectMeetingNote", error);
      return createError(500, "meeting-note-create-failed");
    }
  });
}

export async function updateProjectMeetingNote(
  input: MeetingNoteUpdateInput
): Promise<ServiceResult<{ note: ProjectMeetingNoteSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const noteId = normalizeText(input.noteId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!noteId) {
    return createError(400, "meeting-note-not-found");
  }

  const draft = buildDraft(input);
  const validationError = validateMeetingNoteDraft({
    ...draft,
    scheduledAtRaw: input.scheduledAt,
  });
  if (validationError) {
    return validationError;
  }

  if (input.agentAccess) {
    const agentScopeAccess = requireAgentProjectScopes({
      agentAccess: input.agentAccess,
      projectId: input.projectId,
      requiredScopes: ["task:write"],
    });
    if (!agentScopeAccess.ok) {
      return createError(agentScopeAccess.status, agentScopeAccess.error);
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existing = await db.projectMeetingNote.findFirst({
      where: {
        id: noteId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        actions: { select: { id: true } },
      },
    });
    if (!existing) {
      return createError(404, "meeting-note-not-found");
    }

    try {
      const [participantResolution, mutationActor, actorRegistry] =
        await Promise.all([
          resolveMeetingParticipants({
            db,
            projectId: input.projectId,
            participants: draft.participants,
          }),
          resolveMeetingTodoMutationActor({
            db,
            actorUserId,
            projectId: input.projectId,
            agentAccess: input.agentAccess,
          }),
          loadMeetingTodoActorRegistry({ db, projectId: input.projectId }),
        ]);
      if (!participantResolution.ok) {
        return participantResolution;
      }
      if (!mutationActor.ok) {
        return createError(mutationActor.status, mutationActor.error);
      }
      const assignmentResolution = resolveDraftActionAssignees({
        actions: draft.actions,
        registry: actorRegistry,
      });
      if (!assignmentResolution.ok) {
        return assignmentResolution;
      }

      const existingActionIds = new Set(existing.actions.map((action) => action.id));
      const retainedActionIds = draft.actions.flatMap((action) =>
        action.id ? [action.id] : []
      );
      if (retainedActionIds.some((id) => !existingActionIds.has(id))) {
        return createError(400, "meeting-note-action-invalid");
      }

      const updates = draft.actions.flatMap((action, index) => {
        if (!action.id) {
          return [];
        }
        const assignment = assignmentResolution.assignments[index];
        return [
          {
            where: { id: action.id },
            data: {
              content: action.content,
              position: action.position,
              ...(assignment ?? {}),
            },
          },
        ];
      });
      const creates = draft.actions.flatMap((action, index) => {
        if (action.id) {
          return [];
        }
        return [
          {
            content: action.content,
            completedAt: action.completedAt,
            position: action.position,
            ...buildCreatorPersistence(mutationActor.actor),
            ...(assignmentResolution.assignments[index] ?? {
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
            }),
            ...(action.completedAt
              ? {
                  completedByKind: mutationActor.actor.summary.kind,
                  completedByUserId: mutationActor.actor.userId,
                  completedByCredentialId: mutationActor.actor.credentialId,
                  completedByDisplayNameSnapshot:
                    mutationActor.actor.displayNameSnapshot,
                }
              : {}),
          },
        ];
      });

      await db.projectMeetingNote.update({
        where: { id: noteId },
        data: {
          title: draft.title,
          scheduledAt: draft.scheduledAt,
          participants: {
            deleteMany: {},
            create: participantResolution.participants,
          },
          labelsJson: serializeTaskLabels(draft.labels),
          status: draft.status,
          inputNotes: draft.inputNotes,
          outputNotes: draft.outputNotes,
          decisions: draft.decisions,
          updatedByUserId: actorUserId,
          actions: {
            deleteMany:
              retainedActionIds.length > 0
                ? { id: { notIn: retainedActionIds } }
                : {},
            update: updates,
            create: creates,
          },
        },
      });

      const note = await readMeetingNoteById({
        db,
        projectId: input.projectId,
        noteId,
      });
      if (!note) {
        return createError(404, "meeting-note-not-found");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: { note },
      };
    } catch (error) {
      logServerError("updateProjectMeetingNote", error);
      return createError(500, "meeting-note-update-failed");
    }
  });
}

export async function setProjectMeetingNoteActionCompletion(
  input: MeetingNoteActionCompletionInput
): Promise<ServiceResult<{ note: ProjectMeetingNoteSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const noteId = normalizeText(input.noteId);
  const actionId = normalizeText(input.actionId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!noteId) {
    return createError(400, "meeting-note-not-found");
  }
  if (!actionId) {
    return createError(400, "meeting-note-action-not-found");
  }

  if (input.agentAccess) {
    const agentScopeAccess = requireAgentProjectScopes({
      agentAccess: input.agentAccess,
      projectId: input.projectId,
      requiredScopes: ["task:write"],
    });
    if (!agentScopeAccess.ok) {
      return createError(agentScopeAccess.status, agentScopeAccess.error);
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const action = await db.projectMeetingNoteAction.findFirst({
      where: {
        id: actionId,
        meetingNoteId: noteId,
        meetingNote: {
          projectId: input.projectId,
        },
      },
      select: {
        id: true,
        meetingNote: {
          select: {
            status: true,
          },
        },
      },
    });
    if (!action) {
      return createError(404, "meeting-note-action-not-found");
    }

    try {
      const mutationActor = await resolveMeetingTodoMutationActor({
        db,
        actorUserId,
        projectId: input.projectId,
        agentAccess: input.agentAccess,
      });
      if (!mutationActor.ok) {
        return createError(mutationActor.status, mutationActor.error);
      }

      await db.projectMeetingNoteAction.update({
        where: { id: actionId },
        data: {
          completedAt: input.completed ? new Date() : null,
          completedByKind: input.completed
            ? mutationActor.actor.summary.kind
            : null,
          completedByUserId: input.completed
            ? mutationActor.actor.userId
            : null,
          completedByCredentialId: input.completed
            ? mutationActor.actor.credentialId
            : null,
          completedByDisplayNameSnapshot: input.completed
            ? mutationActor.actor.displayNameSnapshot
            : null,
        },
      });

      await db.projectMeetingNote.update({
        where: { id: noteId },
        data: {
          ...(!input.completed && action.meetingNote.status === "done"
            ? { status: "actions_in_progress" }
            : {}),
          updatedByUserId: actorUserId,
        },
      });

      const note = await readMeetingNoteById({
        db,
        projectId: input.projectId,
        noteId,
      });
      if (!note) {
        return createError(404, "meeting-note-not-found");
      }

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: { note },
      };
    } catch (error) {
      logServerError("setProjectMeetingNoteActionCompletion", error);
      return createError(500, "meeting-note-action-update-failed");
    }
  });
}

export async function setProjectMeetingNoteActionAssignee(
  input: MeetingNoteActionAssigneeInput
): Promise<ServiceResult<{ note: ProjectMeetingNoteSummary }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const noteId = normalizeText(input.noteId);
  const actionId = normalizeText(input.actionId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!noteId || !actionId) {
    return createError(400, "meeting-note-action-not-found");
  }

  if (input.agentAccess) {
    const agentScopeAccess = requireAgentProjectScopes({
      agentAccess: input.agentAccess,
      projectId: input.projectId,
      requiredScopes: ["task:write"],
    });
    if (!agentScopeAccess.ok) {
      return createError(agentScopeAccess.status, agentScopeAccess.error);
    }
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const action = await db.projectMeetingNoteAction.findFirst({
      where: {
        id: actionId,
        meetingNoteId: noteId,
        meetingNote: { projectId: input.projectId },
      },
      select: { id: true },
    });
    if (!action) {
      return createError(404, "meeting-note-action-not-found");
    }

    const assignment = input.assignee
      ? await (async () => {
          const registry = await loadMeetingTodoActorRegistry({
            db,
            projectId: input.projectId,
          });
          return resolveAssignableMeetingTodoActorFromRegistry({
            registry,
            reference: input.assignee as MeetingTodoActorReference,
          });
        })()
      : null;
    if (assignment && !assignment.ok) {
      return createError(assignment.status, assignment.error);
    }

    try {
      await db.projectMeetingNoteAction.update({
        where: { id: actionId },
        data: assignment
          ? {
              assigneeKind: assignment.actor.summary.kind,
              assigneeUserId: assignment.actor.userId,
              assigneeCredentialId: assignment.actor.credentialId,
              assigneeDisplayNameSnapshot: assignment.actor.displayNameSnapshot,
            }
          : {
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
            },
      });
      await db.projectMeetingNote.update({
        where: { id: noteId },
        data: { updatedByUserId: actorUserId },
      });

      const note = await readMeetingNoteById({
        db,
        projectId: input.projectId,
        noteId,
      });
      if (!note) {
        return createError(404, "meeting-note-not-found");
      }
      await touchProjectActivity({ db, projectId: input.projectId });
      return { ok: true, data: { note } };
    } catch (error) {
      logServerError("setProjectMeetingNoteActionAssignee", error);
      return createError(500, "meeting-note-action-update-failed");
    }
  });
}

export async function deleteProjectMeetingNote(input: {
  actorUserId: string;
  projectId: string;
  noteId: string;
  agentAccess?: AgentProjectAccessContext;
}): Promise<ServiceResult<{ ok: true }>> {
  const actorUserId = normalizeText(input.actorUserId);
  const noteId = normalizeText(input.noteId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!noteId) {
    return createError(400, "meeting-note-not-found");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existing = await db.projectMeetingNote.findFirst({
      where: {
        id: noteId,
        projectId: input.projectId,
      },
      select: { id: true },
    });
    if (!existing) {
      return createError(404, "meeting-note-not-found");
    }

    try {
      await db.projectMeetingNote.delete({
        where: { id: noteId },
      });

      await touchProjectActivity({ db, projectId: input.projectId });

      return {
        ok: true,
        data: { ok: true },
      };
    } catch (error) {
      logServerError("deleteProjectMeetingNote", error);
      return createError(500, "meeting-note-delete-failed");
    }
  });
}
