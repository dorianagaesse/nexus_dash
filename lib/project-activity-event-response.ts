import { logServerWarning } from "@/lib/observability/logger";
import {
  type ProjectActivityEventAction,
  type ProjectActivityEventDomain,
} from "@/lib/project-activity-event-types";
import {
  recordProjectActivityEventAsActor,
  touchProjectActivityAsActor,
} from "@/lib/services/project-activity-service";

export async function recordProjectActivityEventVersion(input: {
  actorUserId: string;
  projectId: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  payload?: unknown;
}): Promise<Date> {
  async function touchFallback(): Promise<Date> {
    let fallback: Awaited<ReturnType<typeof touchProjectActivityAsActor>>;
    try {
      fallback = await touchProjectActivityAsActor({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
      });
    } catch (error) {
      logServerWarning(
        "recordProjectActivityEventVersion.fallbackException",
        "Could not advance project activity marker after typed event exception",
        {
          projectId: input.projectId,
          domain: input.domain,
          action: input.action,
          entityId: input.entityId,
          error,
        }
      );

      return new Date();
    }

    if (fallback.ok) {
      return fallback.data.version;
    }

    logServerWarning(
      "recordProjectActivityEventVersion.fallbackFailed",
      "Could not advance project activity marker after typed event failure",
      {
        projectId: input.projectId,
        domain: input.domain,
        action: input.action,
        entityId: input.entityId,
        status: fallback.status,
        error: fallback.error,
      }
    );

    return new Date();
  }

  let result: Awaited<ReturnType<typeof recordProjectActivityEventAsActor>>;
  try {
    result = await recordProjectActivityEventAsActor(input);
  } catch (error) {
    logServerWarning(
      "recordProjectActivityEventVersion.exception",
      "Could not record typed project activity event",
      {
        projectId: input.projectId,
        domain: input.domain,
        action: input.action,
        entityId: input.entityId,
        error,
      }
    );
    return touchFallback();
  }

  if (result.ok) {
    return result.data.version;
  }

  logServerWarning(
    "recordProjectActivityEventVersion.failed",
    "Could not record typed project activity event",
    {
      projectId: input.projectId,
      domain: input.domain,
      action: input.action,
      entityId: input.entityId,
      status: result.status,
      error: result.error,
    }
  );

  return touchFallback();
}
