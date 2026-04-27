import { Map } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import {
  ProjectRoadmapPanel,
  type ProjectRoadmapPanelPhase,
} from "@/components/project-roadmap-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logServerError } from "@/lib/observability/logger";
import { listProjectRoadmapPhases } from "@/lib/services/project-roadmap-service";

interface ProjectRoadmapPanelSectionProps {
  projectId: string;
  actorUserId: string;
  canEdit: boolean;
}

export async function ProjectRoadmapPanelSection({
  projectId,
  actorUserId,
  canEdit,
}: ProjectRoadmapPanelSectionProps) {
  let phases: ProjectRoadmapPanelPhase[] = [];
  let loadError: string | null = null;

  try {
    phases = await listProjectRoadmapPhases(projectId, actorUserId);
  } catch (error) {
    logServerError("ProjectRoadmapPanelSection", error, {
      actorUserId,
      projectId,
    });
    loadError = "Roadmap is temporarily unavailable. Reload to try again.";
  }

  return (
    <ProjectRoadmapPanel
      projectId={projectId}
      canEdit={canEdit}
      phases={phases}
      loadError={loadError}
    />
  );
}

export function ProjectRoadmapPanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Map className="h-4 w-4" />
          Roadmap
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-4 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="hidden h-52 animate-pulse rounded-3xl bg-muted/70 lg:block" />
        <div className="grid gap-3 lg:hidden">
          <div className="h-32 animate-pulse rounded-2xl bg-muted/70" />
          <div className="h-32 animate-pulse rounded-2xl bg-muted/70" />
        </div>
      </CardContent>
    </Card>
  );
}
