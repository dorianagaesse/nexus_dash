import { History } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { ProjectTimelinePanel } from "@/components/project-timeline-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectTimelinePanelSectionProps {
  projectId: string;
}

export function ProjectTimelinePanelSection({
  projectId,
}: ProjectTimelinePanelSectionProps) {
  return <ProjectTimelinePanel projectId={projectId} />;
}

export function ProjectTimelinePanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="h-16 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-16 w-full animate-pulse rounded-xl bg-muted" />
      </CardContent>
    </Card>
  );
}
