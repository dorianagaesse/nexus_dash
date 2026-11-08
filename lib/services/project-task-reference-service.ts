import { formatTaskReference } from "@/lib/task-reference";
import { logServerError } from "@/lib/observability/logger";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

export async function resolveProjectTaskReference(input: {
  actorUserId: string;
  projectId: string;
  reference: string;
  namespace: string;
  agentAccess?: AgentProjectAccessContext;
}) {
  const error = (status: number, message: string) =>
    ({ ok: false, status, error: message }) as const;
  if (!input.actorUserId.trim()) return error(401, "unauthorized");
  if (!input.projectId.trim()) return error(400, "project-required");
  const scope = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:read"],
  });
  if (!scope.ok) return error(scope.status, scope.error);
  const reference = input.reference.trim();
  const number = Number(reference.slice(3));
  if (!/^ND-[1-9]\d*$/i.test(reference) || !Number.isSafeInteger(number) || number > 2147483647) {
    return error(400, "invalid-reference");
  }
  if (input.namespace !== "current" && input.namespace !== "legacy") {
    return error(400, "invalid-reference-namespace");
  }

  try {
    return await withActorRlsContext(input.actorUserId, async (db) => {
      const access = await requireProjectRole({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        minimumRole: "viewer",
        db,
      });
      if (!access.ok) return error(access.status, access.error);
      const task = await db.task.findFirst({
        where: {
          projectId: input.projectId,
          ...(input.namespace === "legacy"
            ? { legacyReferenceNumber: number }
            : { referenceNumber: number }),
        },
        select: { id: true, referenceNumber: true, legacyReferenceNumber: true },
      });
      if (!task) return error(404, "Task not found");
      return {
        ok: true,
        data: {
          id: task.id,
          projectId: input.projectId,
          reference: formatTaskReference(task.referenceNumber),
          legacyReference: task.legacyReferenceNumber == null
            ? null : formatTaskReference(task.legacyReferenceNumber),
          url: `/projects/${encodeURIComponent(input.projectId)}?taskId=${encodeURIComponent(task.id)}`,
        },
      } as const;
    });
  } catch (cause) {
    logServerError("resolveProjectTaskReference", cause, { projectId: input.projectId });
    return error(500, "task-reference-lookup-failed");
  }
}
