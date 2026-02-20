import { CalendarDays } from "lucide-react";

import { ProjectCalendarPanel } from "@/components/project-calendar-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectCalendarPanelSectionProps {
  projectId: string;
  calendarId: string | null;
}

export function ProjectCalendarPanelSection({
  projectId,
  calendarId,
}: ProjectCalendarPanelSectionProps) {
  return <ProjectCalendarPanel projectId={projectId} calendarId={calendarId} />;
}

export function ProjectCalendarPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-10 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}
