import { logServerError } from "@/lib/observability/logger";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { type DbClient, withActorRlsContext } from "@/lib/services/rls-context";

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 140;
const MAX_PARTICIPANTS = 40;
const MAX_PARTICIPANT_LENGTH = 80;
const MAX_SECTION_LENGTH = 10000;
const MAX_ACTIONS = 40;
const MAX_ACTION_LENGTH = 240;

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
}

export interface MeetingNoteMutationInput {
  actorUserId: string;
  projectId: string;
  title: string;
  scheduledAt?: Date | string | null;
  participants?: string[];
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
  participants: string[];
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
}

type MeetingNoteRecord = {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: Date | null;
  participants: string[];
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  createdAt: Date;
  updatedAt: Date;
  actions: Array<{
    id: string;
    content: string;
    completedAt: Date | null;
    position: number;
  }>;
};

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

function normalizeParticipants(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const participants: string[] = [];

  for (const entry of value) {
    const participant = normalizeText(entry).replace(/\s+/g, " ");
    const key = participant.toLocaleLowerCase();
    if (!participant || seen.has(key)) {
      continue;
    }

    seen.add(key);
    participants.push(participant);
  }

  return participants;
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
): Array<{ content: string; completedAt: Date | null; position: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((action) => ({
      content: normalizeText(action.content),
      completedAt: normalizeScheduledAt(action.completedAt ?? null),
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
  participants: string[];
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  actions: Array<{ content: string }>;
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
      (participant) => participant.length > MAX_PARTICIPANT_LENGTH
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

  return null;
}

function mapMeetingNote(note: MeetingNoteRecord): ProjectMeetingNoteSummary {
  return {
    id: note.id,
    projectId: note.projectId,
    title: note.title,
    scheduledAt: note.scheduledAt,
    participants: note.participants,
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
    ...note.participants,
    note.inputNotes,
    note.outputNotes,
    note.decisions,
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
  const note = await input.db.projectMeetingNote.findFirst({
    where: {
      id: input.noteId,
      projectId: input.projectId,
    },
    include: {
      actions: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return note ? mapMeetingNote(note) : null;
}

function buildDraft(input: MeetingNoteMutationInput) {
  const title = normalizeText(input.title);
  const scheduledAt = normalizeScheduledAt(input.scheduledAt ?? null);
  const participants = normalizeParticipants(input.participants);
  const inputNotes = normalizeLongText(input.inputNotes);
  const outputNotes = normalizeLongText(input.outputNotes);
  const decisions = normalizeLongText(input.decisions);
  const actions = normalizeActionInputs(input.actions);

  return {
    title,
    scheduledAt,
    participants,
    inputNotes,
    outputNotes,
    decisions,
    actions,
  };
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

    const notes = await db.projectMeetingNote.findMany({
      where: {
        projectId: input.projectId,
      },
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
      include: {
        actions: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    const query = normalizeText(input.query).toLocaleLowerCase();
    return notes.map((note) => mapMeetingNote(note)).filter((note) => noteMatchesSearch(note, query));
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
      const created = await db.projectMeetingNote.create({
        data: {
          projectId: input.projectId,
          title: draft.title,
          scheduledAt: draft.scheduledAt,
          participants: draft.participants,
          inputNotes: draft.inputNotes,
          outputNotes: draft.outputNotes,
          decisions: draft.decisions,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          actions: {
            create: draft.actions.map((action) => ({
              content: action.content,
              completedAt: action.completedAt,
              position: action.position,
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
      await db.projectMeetingNote.update({
        where: { id: noteId },
        data: {
          title: draft.title,
          scheduledAt: draft.scheduledAt,
          participants: draft.participants,
          inputNotes: draft.inputNotes,
          outputNotes: draft.outputNotes,
          decisions: draft.decisions,
          updatedByUserId: actorUserId,
          actions: {
            deleteMany: {},
            create: draft.actions.map((action) => ({
              content: action.content,
              completedAt: action.completedAt,
              position: action.position,
            })),
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
