import { formatTaskDeadlineDate, formatTaskDeadlineForDisplay } from "@/lib/task-deadline";

export const ROADMAP_MILESTONE_STATUSES = ["planned", "active", "reached"] as const;

export type RoadmapMilestoneStatus = (typeof ROADMAP_MILESTONE_STATUSES)[number];

export interface ProjectRoadmapMilestone {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: RoadmapMilestoneStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

const ROADMAP_MILESTONE_STATUS_LABELS: Record<RoadmapMilestoneStatus, string> = {
  planned: "Planned",
  active: "Active",
  reached: "Reached",
};

export function isRoadmapMilestoneStatus(value: unknown): value is RoadmapMilestoneStatus {
  return (
    typeof value === "string" &&
    ROADMAP_MILESTONE_STATUSES.includes(value as RoadmapMilestoneStatus)
  );
}

export function getRoadmapMilestoneStatusLabel(status: RoadmapMilestoneStatus): string {
  return ROADMAP_MILESTONE_STATUS_LABELS[status];
}

export function formatRoadmapTargetDate(value: Date | string | null | undefined): string | null {
  return formatTaskDeadlineDate(value);
}

export function formatRoadmapTargetDateForDisplay(value: string, locale?: string): string {
  return formatTaskDeadlineForDisplay(value, locale);
}
