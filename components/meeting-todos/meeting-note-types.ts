export type MeetingNoteStatus = "prepared" | "actions_in_progress" | "done";

export interface ProjectMeetingNotePanelAction {
  id: string;
  content: string;
  completedAt: string | null;
  position: number;
}

export interface ProjectMeetingNotePanelNote {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string | null;
  participants: string[];
  labels: string[];
  status: MeetingNoteStatus;
  inputNotes: string;
  outputNotes: string;
  decisions?: string;
  actions: ProjectMeetingNotePanelAction[];
  createdAt: string;
  updatedAt: string;
}
