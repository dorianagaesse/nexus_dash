import type {
  ProjectMeetingNotePanelAction,
  ProjectMeetingNotePanelNote,
} from "@/components/meeting-todos/meeting-note-types";

export const MEETING_TODO_OVERDUE_GRACE_DAYS = 7;
const MEETING_TODO_OVERDUE_GRACE_MS =
  MEETING_TODO_OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

export interface ProjectMeetingTodo {
  action: ProjectMeetingNotePanelAction;
  note: ProjectMeetingNotePanelNote;
  isOverdue: boolean;
  urgencyTimestamp: number;
}

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isMeetingTodoOverdue(
  note: ProjectMeetingNotePanelNote,
  action: ProjectMeetingNotePanelAction,
  referenceNowMs: number
): boolean {
  if (action.completedAt || note.status === "done") {
    return false;
  }

  const scheduledAtMs = toTimestamp(note.scheduledAt);
  return (
    scheduledAtMs !== null &&
    referenceNowMs - scheduledAtMs >= MEETING_TODO_OVERDUE_GRACE_MS
  );
}

export function buildProjectMeetingTodos(
  notes: ProjectMeetingNotePanelNote[],
  referenceNowMs: number
): {
  open: ProjectMeetingTodo[];
  completed: ProjectMeetingTodo[];
} {
  const todos = notes.flatMap((note) =>
    note.actions.map((action) => {
      const scheduledAtMs =
        toTimestamp(note.scheduledAt) ?? toTimestamp(note.createdAt) ?? 0;

      return {
        action,
        note,
        isOverdue: isMeetingTodoOverdue(note, action, referenceNowMs),
        urgencyTimestamp: scheduledAtMs,
      };
    })
  );

  const open = todos
    .filter((todo) => todo.action.completedAt === null)
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) {
        return left.isOverdue ? -1 : 1;
      }

      return left.urgencyTimestamp - right.urgencyTimestamp;
    });

  const completed = todos
    .filter((todo) => todo.action.completedAt !== null)
    .sort((left, right) => {
      const leftCompletedAt = toTimestamp(left.action.completedAt) ?? 0;
      const rightCompletedAt = toTimestamp(right.action.completedAt) ?? 0;
      return rightCompletedAt - leftCompletedAt;
    });

  return { open, completed };
}
