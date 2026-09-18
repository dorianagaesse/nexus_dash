export type ProjectActivityDomain =
  | "task"
  | "task-comment"
  | "context-card"
  | "meeting-note"
  | "project"
  | "epic"
  | "roadmap"
  | "attachment"
  | "membership";

export type ProjectActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "moved"
  | "reordered"
  | "archived"
  | "unarchived"
  | "transferred";

export type ProjectActivityEventDomain = ProjectActivityDomain;
export type ProjectActivityEventAction = ProjectActivityAction;

export interface ProjectActivityEventPayload {
  eventId: string | null;
  projectId: string;
  version: string;
  serverTime: string;
  actorUserId: string | null;
  domain: ProjectActivityDomain | null;
  action: ProjectActivityAction | null;
  entityId: string | null;
  payload: unknown;
}
