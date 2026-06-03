export type ProjectActivityDomain =
  | "task"
  | "task-comment"
  | "context-card"
  | "project";

export type ProjectActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "moved"
  | "reordered";

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
