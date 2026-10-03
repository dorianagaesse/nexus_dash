import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import type {
  ProjectActivityEventCursor,
  ProjectActivityEventRecord,
} from "@/lib/services/project-activity-service";

export const PROJECT_ACTIVITY_STREAM_EVENT = "project-activity";

export function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
  return Date.parse(nextVersion) > Date.parse(currentVersion);
}

export function compareActivityEventCursor(
  event: ProjectActivityEventRecord,
  cursor: ProjectActivityEventCursor
): number {
  const versionDiff = event.version.getTime() - cursor.version.getTime();
  if (versionDiff !== 0 || !cursor.createdAt || !cursor.id) {
    return versionDiff;
  }

  const createdAtDiff = event.createdAt.getTime() - cursor.createdAt.getTime();
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return event.id.localeCompare(cursor.id);
}

export function createEventCursor(
  event: ProjectActivityEventRecord
): ProjectActivityEventCursor {
  return {
    version: event.version,
    createdAt: event.createdAt,
    id: event.id,
  };
}

export function serializeActivityCursor(cursor: ProjectActivityEventCursor): string {
  if (!cursor.createdAt || !cursor.id) {
    return cursor.version.toISOString();
  }

  return [
    cursor.version.toISOString(),
    cursor.createdAt.toISOString(),
    cursor.id,
  ].join("|");
}

export function createActivityPayload(input: {
  projectId: string;
  version: Date;
}): ProjectActivityEventPayload {
  return {
    eventId: null,
    projectId: input.projectId,
    version: input.version.toISOString(),
    serverTime: new Date().toISOString(),
    actorUserId: null,
    domain: null,
    action: null,
    entityId: null,
    payload: null,
  };
}

export function createActivityEventPayload(
  event: ProjectActivityEventRecord
): ProjectActivityEventPayload {
  return {
    eventId: event.id,
    projectId: event.projectId,
    version: event.version.toISOString(),
    serverTime: new Date().toISOString(),
    actorUserId: event.actorUserId,
    domain: event.domain,
    action: event.action,
    entityId: event.entityId,
    payload: event.payload,
  };
}
