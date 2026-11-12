import { resolveProjectMutationActor } from "@/lib/services/project-actor-service";
import type { AgentProjectAccessContext } from "@/lib/services/project-access-service";
import type { DbClient } from "@/lib/services/rls-context";

export async function resolveTaskAttachmentUploader(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  agentAccess?: AgentProjectAccessContext;
}) {
  const result = await resolveProjectMutationActor(input);
  if (!result.ok) return result;
  return { ok: true as const, data: {
    uploadedByUserId: input.actorUserId,
    uploadedByKind: result.actor.summary.kind,
    uploadedByCredentialId: result.actor.credentialId,
    uploadedByDisplayNameSnapshot: result.actor.displayNameSnapshot.slice(0, 80),
  } };
}
