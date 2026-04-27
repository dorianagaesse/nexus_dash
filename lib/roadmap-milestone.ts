import { formatTaskDeadlineDate, formatTaskDeadlineForDisplay } from "@/lib/task-deadline";

export const ROADMAP_STATUSES = ["planned", "active", "reached"] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type RoadmapMilestoneStatus = RoadmapStatus;

export interface ProjectRoadmapEvent {
  id: string;
  phaseId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: RoadmapStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRoadmapPhase {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: RoadmapStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
  events: ProjectRoadmapEvent[];
}

const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  planned: "Planned",
  active: "Active",
  reached: "Reached",
};

export function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return typeof value === "string" && ROADMAP_STATUSES.includes(value as RoadmapStatus);
}

export function isRoadmapMilestoneStatus(value: unknown): value is RoadmapMilestoneStatus {
  return isRoadmapStatus(value);
}

export function getRoadmapStatusLabel(status: RoadmapStatus): string {
  return ROADMAP_STATUS_LABELS[status];
}

export function getRoadmapMilestoneStatusLabel(status: RoadmapMilestoneStatus): string {
  return getRoadmapStatusLabel(status);
}

export function formatRoadmapTargetDate(value: Date | string | null | undefined): string | null {
  return formatTaskDeadlineDate(value);
}

export function formatRoadmapTargetDateForDisplay(value: string, locale?: string): string {
  return formatTaskDeadlineForDisplay(value, locale);
}
