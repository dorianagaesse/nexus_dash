import { legacyDashboardTasks } from "./task-projections";
import type { DbClient } from "@/lib/services/rls-context";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";

// Compatibility aggregate: Task owns this legacy projection; project/resources
// remain joined here to preserve its aggregate query shape and missing-project result.
export function loadLegacyTaskDashboard(db: DbClient, projectId: string, actorUserId: string) {
  return db.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectPrincipalWhere(actorUserId),
    },
    include: {
      tasks: legacyDashboardTasks,
      resources: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
    },
  });
}
