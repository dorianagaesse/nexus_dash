import { Flag } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import {
  ProjectEpicPanel,
  type ProjectEpicPanelEpic,
} from "@/components/project-epic-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectEpics } from "@/lib/services/project-epic-service";

interface ProjectEpicPanelSectionProps {
  projectId: string;
  actorUserId: string;
  canEdit: boolean;
}

export async function ProjectEpicPanelSection({
  projectId,
  actorUserId,
  canEdit,
}: ProjectEpicPanelSectionProps) {
  const epics = await listProjectEpics(projectId, actorUserId);

  const serializableEpics: ProjectEpicPanelEpic[] = epics.map((epic) => ({
    ...epic,
    createdAt: epic.createdAt.toISOString(),
    updatedAt: epic.updatedAt.toISOString(),
  }));

  return (
    <ProjectEpicPanel
      projectId={projectId}
      canEdit={canEdit}
      epics={serializableEpics}
    />
  );
}

export function ProjectEpicPanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4" />
          Epics
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
      </CardContent>
    </Card>
  );
}
