import { CalendarDays } from "lucide-react";

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
    <Card className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.6)]">
      <CardHeader className="border-b border-border/50 bg-background/30">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 py-5">
        <div className="h-10 w-44 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-xl bg-muted" />
      </CardContent>
    </Card>
  );
}
