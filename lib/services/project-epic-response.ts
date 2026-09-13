import type { ProjectEpicSummary } from "@/lib/services/project-epic-service";

export function serializeProjectEpicResponse(epic: ProjectEpicSummary) {
  return {
    ...epic,
    archivedAt: epic.archivedAt ? epic.archivedAt.toISOString() : null,
    createdAt: epic.createdAt.toISOString(),
    updatedAt: epic.updatedAt.toISOString(),
  };
}
