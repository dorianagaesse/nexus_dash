import { logServerWarning } from "@/lib/observability/logger";
import {
  type ProjectActivityEventAction,
  type ProjectActivityEventDomain,
  recordProjectActivityEventAsActor,
} from "@/lib/services/project-activity-service";

export async function recordProjectActivityEventVersion(input: {
  actorUserId: string;
  projectId: string;
  domain: ProjectActivityEventDomain;
  action: ProjectActivityEventAction;
  entityId: string;
  payload?: unknown;
}): Promise<Date> {
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
    return new Date();
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

  return new Date();
}
