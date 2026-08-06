import type { ProjectMeetingParticipantIdentity } from "@/lib/meeting-participant";
import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";

export type MeetingNoteStatus = "prepared" | "actions_in_progress" | "done";

export interface ProjectMeetingNotePanelAction {
  id: string;
  content: string;
  completedAt: string | null;
  position: number;
  creator?: MeetingTodoActorSummary | null;
  assignee?: MeetingTodoActorSummary | null;
  completedBy?: MeetingTodoActorSummary | null;
}

export interface ProjectMeetingNotePanelNote {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string | null;
  participants: ProjectMeetingParticipantIdentity[];
  labels: string[];
  status: MeetingNoteStatus;
  inputNotes: string;
  outputNotes: string;
  decisions?: string;
  actions: ProjectMeetingNotePanelAction[];
  createdAt: string;
  updatedAt: string;
}
