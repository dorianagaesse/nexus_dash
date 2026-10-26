import type { ProjectMeetingParticipantIdentity } from "@/lib/meeting-participant";
import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";

export type MeetingNoteStatus = "prepared" | "actions_in_progress" | "done";
export type MeetingNoteVisibility = "private" | "team";

export interface ProjectMeetingNotePanelAction {
  id: string;
  content: string;
  completedAt: string | null;
  assignedAt?: string | null;
  position: number;
  creator?: MeetingTodoActorSummary | null;
  assignee?: MeetingTodoActorSummary | null;
  assignedBy?: MeetingTodoActorSummary | null;
  completedBy?: MeetingTodoActorSummary | null;
}

export interface ProjectMeetingNotePanelNote {
  id: string;
  contentRevision: number;
  projectId: string;
  title: string;
  scheduledAt: string | null;
  participants: ProjectMeetingParticipantIdentity[];
  labels: string[];
  status: MeetingNoteStatus;
  visibility?: MeetingNoteVisibility;
  canOpenNote?: boolean;
  inputNotes: string;
  outputNotes: string;
  decisions?: string;
  actions: ProjectMeetingNotePanelAction[];
  steward?: MeetingTodoActorSummary | null;
  createdBy?: MeetingTodoActorSummary | null;
  updatedBy?: MeetingTodoActorSummary | null;
  createdAt: string;
  updatedAt: string;
}
