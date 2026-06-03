import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  encodeServerSentEvent,
  sleepWithAbort,
} from "@/lib/realtime/server-sent-events";
import { getProjectActivitySnapshot } from "@/lib/services/project-activity-service";
import { requireAgentProjectScopes } from "@/lib/services/project-access-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PROJECT_ACTIVITY_STREAM_EVENT = "project-activity";
const PROJECT_ACTIVITY_STREAM_RETRY_MS = 2_000;
const PROJECT_ACTIVITY_STREAM_POLL_INTERVAL_MS = 1_000;
const PROJECT_ACTIVITY_STREAM_HEARTBEAT_INTERVAL_MS = 15_000;
const PROJECT_ACTIVITY_STREAM_MAX_DURATION_MS = 280_000;

interface ProjectActivityStreamPayload {
  projectId: string;
  version: string;
  serverTime: string;
}

function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
  return Date.parse(nextVersion) > Date.parse(currentVersion);
}

function createActivityPayload(input: {
  projectId: string;
  version: Date;
}): ProjectActivityStreamPayload {
  return {
    projectId: input.projectId,
    version: input.version.toISOString(),
    serverTime: new Date().toISOString(),
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
      let lastVersion = initialSnapshot.data.version.toISOString();
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
        id: lastVersion,
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
          lastVersion = nextVersion;
          lastHeartbeatAt = Date.now();
          enqueueEvent({
            event: PROJECT_ACTIVITY_STREAM_EVENT,
            id: lastVersion,
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
  createActivityPayload,
  encodeServerSentEvent,
  isNewerVersion,
  PROJECT_ACTIVITY_STREAM_EVENT,
};
