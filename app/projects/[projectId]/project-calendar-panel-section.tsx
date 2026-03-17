import { CalendarDays } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { ProjectCalendarPanel } from "@/components/project-calendar-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectCalendarPanelSectionProps {
  projectId: string;
}

export function ProjectCalendarPanelSection({
  projectId,
}: ProjectCalendarPanelSectionProps) {
  return <ProjectCalendarPanel projectId={projectId} />;
}

export function ProjectCalendarPanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="h-10 w-44 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-xl bg-muted" />
      </CardContent>
    </Card>
  );
}
