import type { ProjectActorSummary } from "@/lib/project-actor";

export interface ProjectTimelineChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ProjectTimelineEntry {
  id: string;
  domain: string;
  action: string;
  entityId: string;
  entityDisplayNameSnapshot: string | null;
  summary: string | null;
  changes: ProjectTimelineChange[] | null;
  version: string;
  createdAt: string;
  actor: ProjectActorSummary | null;
}

export interface ProjectTimelinePage {
  entries: ProjectTimelineEntry[];
  nextCursor: string | null;
}

export const PROJECT_TIMELINE_PAGE_SIZE = 25;

export const PROJECT_TIMELINE_ACTOR_STATUS_LABEL: Record<
  ProjectActorSummary["status"],
  string | null
> = {
  active: null,
  inactive: "former member",
  revoked: "revoked credential",
  expired: "expired credential",
};

export function buildProjectTimelineRequestUrl(input: {
  projectId: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    take: String(PROJECT_TIMELINE_PAGE_SIZE),
  });
  const cursor = input.cursor?.trim();
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/api/projects/${encodeURIComponent(input.projectId)}/history?${params.toString()}`;
}

export function formatProjectTimelineTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const showYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatProjectTimelineChangeValue(value: string | null): string {
  if (value == null || value.trim() === "") {
    return "—";
  }

  return value;
}
