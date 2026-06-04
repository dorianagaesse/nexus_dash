import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  encodeServerSentEvent,
  sleepWithAbort,
} from "@/lib/realtime/server-sent-events";
import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import {
  getProjectActivitySnapshot,
  listProjectActivityEventsSince,
  type ProjectActivityEventCursor,
  type ProjectActivityEventRecord,
} from "@/lib/services/project-activity-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PROJECT_ACTIVITY_STREAM_EVENT = "project-activity";
const PROJECT_ACTIVITY_STREAM_RETRY_MS = 2_000;
const PROJECT_ACTIVITY_STREAM_POLL_INTERVAL_MS = 1_000;
const PROJECT_ACTIVITY_STREAM_HEARTBEAT_INTERVAL_MS = 15_000;
const PROJECT_ACTIVITY_STREAM_MAX_DURATION_MS = 280_000;

function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
  return Date.parse(nextVersion) > Date.parse(currentVersion);
}

function compareActivityEventCursor(
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

function createEventCursor(
  event: ProjectActivityEventRecord
): ProjectActivityEventCursor {
  return {
    version: event.version,
    createdAt: event.createdAt,
    id: event.id,
  };
}

function serializeActivityCursor(cursor: ProjectActivityEventCursor): string {
  if (!cursor.createdAt || !cursor.id) {
    return cursor.version.toISOString();
  }

  return [
    cursor.version.toISOString(),
    cursor.createdAt.toISOString(),
    cursor.id,
  ].join("|");
}

function createActivityPayload(input: {
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

function createActivityEventPayload(
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

function streamHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId: params.projectId,
    requiredScopes: ["project:read"],
  });
  if (!agentScopeAccess.ok) {
    return NextResponse.json(
      { error: agentScopeAccess.error },
      {
        status: agentScopeAccess.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const initialSnapshot = await getProjectActivitySnapshot({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
  });

  if (!initialSnapshot.ok) {
    return NextResponse.json(
      { error: initialSnapshot.error },
      {
        status: initialSnapshot.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const encoder = new TextEncoder();
  let streamCancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastCursor: ProjectActivityEventCursor = {
        version: initialSnapshot.data.version,
      };
      let lastVersion = lastCursor.version.toISOString();
      let lastHeartbeatAt = Date.now();
      const closeAt = Date.now() + PROJECT_ACTIVITY_STREAM_MAX_DURATION_MS;

      function enqueueEvent(input: {
        event?: string;
        id?: string;
        data?: unknown;
        comment?: string;
        retry?: number;
      }) {
        if (streamCancelled) {
          return;
        }

        controller.enqueue(encoder.encode(encodeServerSentEvent(input)));
      }

      enqueueEvent({
        event: PROJECT_ACTIVITY_STREAM_EVENT,
        id: serializeActivityCursor(lastCursor),
        retry: PROJECT_ACTIVITY_STREAM_RETRY_MS,
        data: createActivityPayload(initialSnapshot.data),
      });

      while (
        !streamCancelled &&
        !request.signal.aborted &&
        Date.now() < closeAt
      ) {
        try {
          await sleepWithAbort(
            PROJECT_ACTIVITY_STREAM_POLL_INTERVAL_MS,
            request.signal
          );
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError") {
            break;
          }

          throw error;
        }

        const events = await listProjectActivityEventsSince({
          actorUserId: principalResult.principal.actorUserId,
          projectId: params.projectId,
          afterVersion: lastCursor.version,
          afterCursor: lastCursor,
        });

        if (!events.ok) {
          enqueueEvent({
            event: "error",
            data: {
              error: events.error,
              status: events.status,
            },
          });
          break;
        }

        if (events.data.length > 0) {
          for (const activityEvent of events.data) {
            if (compareActivityEventCursor(activityEvent, lastCursor) <= 0) {
              continue;
            }

            lastCursor = createEventCursor(activityEvent);
            lastVersion = lastCursor.version.toISOString();
            lastHeartbeatAt = Date.now();
            enqueueEvent({
              event: PROJECT_ACTIVITY_STREAM_EVENT,
              id: serializeActivityCursor(lastCursor),
              data: createActivityEventPayload(activityEvent),
            });
          }
          continue;
        }

        const snapshot = await getProjectActivitySnapshot({
          actorUserId: principalResult.principal.actorUserId,
          projectId: params.projectId,
        });

        if (!snapshot.ok) {
          enqueueEvent({
            event: "error",
            data: {
              error: snapshot.error,
              status: snapshot.status,
            },
          });
          break;
        }

        const nextVersion = snapshot.data.version.toISOString();
        if (isNewerVersion(nextVersion, lastVersion)) {
          lastCursor = {
            version: snapshot.data.version,
          };
          lastVersion = nextVersion;
          lastHeartbeatAt = Date.now();
          enqueueEvent({
            event: PROJECT_ACTIVITY_STREAM_EVENT,
            id: serializeActivityCursor(lastCursor),
            data: createActivityPayload(snapshot.data),
          });
          continue;
        }

        if (Date.now() - lastHeartbeatAt >= PROJECT_ACTIVITY_STREAM_HEARTBEAT_INTERVAL_MS) {
          lastHeartbeatAt = Date.now();
          enqueueEvent({ comment: "heartbeat" });
        }
      }

      if (!streamCancelled) {
        controller.close();
      }
    },
    cancel() {
      streamCancelled = true;
    },
  });

  return new Response(stream, {
    headers: streamHeaders(),
  });
}

export const projectActivityStreamRouteInternals = {
  createActivityEventPayload,
  createActivityPayload,
  compareActivityEventCursor,
  encodeServerSentEvent,
  isNewerVersion,
  PROJECT_ACTIVITY_STREAM_EVENT,
  serializeActivityCursor,
};
