import type { ProjectActorSummary } from "@/lib/project-actor";
import type { ProjectEpicSummary } from "@/lib/services/project-epic-service";

export function serializeProjectEpicResponse(epic: ProjectEpicSummary) {
  return {
    ...epic,
    archivedAt: epic.archivedAt ? epic.archivedAt.toISOString() : null,
    createdAt: epic.createdAt.toISOString(),
    updatedAt: epic.updatedAt.toISOString(),
    leadAssignedAt: epic.leadAssignedAt ? epic.leadAssignedAt.toISOString() : null,
  };
}

// Durable actor snapshot carried by epic activity-event payloads so history
// stays attributable after a member or credential leaves the project.
export function serializeProjectEpicEventActor(
  actor: ProjectActorSummary
): { kind: "human" | "agent"; id: string; displayName: string } {
  return {
    kind: actor.kind,
    id: actor.id,
    displayName: actor.displayName,
  };
}
