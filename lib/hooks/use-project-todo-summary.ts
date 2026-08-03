"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  PROJECT_ACTIVITY_MUTATION_EVENT,
  PROJECT_ACTIVITY_REMOTE_EVENT,
  type ProjectActivityMutationDetail,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";

export interface ProjectTodoNavigationSummary {
  activeCount: number;
  hasOverdue: boolean;
}

function parseSummary(value: unknown): ProjectTodoNavigationSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ProjectTodoNavigationSummary>;
  if (
    !Number.isSafeInteger(candidate.activeCount) ||
    (candidate.activeCount ?? -1) < 0 ||
    typeof candidate.hasOverdue !== "boolean"
  ) {
    return null;
  }

  return {
    activeCount: candidate.activeCount as number,
    hasOverdue: candidate.hasOverdue,
  };
}

export function useProjectTodoSummary(
  projectId: string | null
): ProjectTodoNavigationSummary | null {
  const [summary, setSummary] = useState<ProjectTodoNavigationSummary | null>(
    null
  );
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSummary(null);
      return;
    }

    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/meeting-todos/summary`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error("project-todo-summary-load-failed");
      }

      const nextSummary = parseSummary(await response.json());
      if (!nextSummary) {
        throw new Error("project-todo-summary-invalid");
      }

      if (latestRequest.current === requestId) {
        setSummary(nextSummary);
      }
    } catch {
      if (latestRequest.current === requestId) {
        setSummary(null);
      }
    }
  }, [projectId]);

  useEffect(() => {
    setSummary(null);
    void refresh();

    function handleMutation(event: Event) {
      const detail = (event as CustomEvent<ProjectActivityMutationDetail>)
        .detail;
      if (detail.projectId === projectId && detail.phase === "finish") {
        void refresh();
      }
    }

    function handleRemoteActivity(event: Event) {
      const { activity } = (
        event as CustomEvent<ProjectActivityRemoteEventDetail>
      ).detail;
      if (
        activity.projectId === projectId &&
        activity.domain === "meeting-note"
      ) {
        void refresh();
      }
    }

    window.addEventListener(PROJECT_ACTIVITY_MUTATION_EVENT, handleMutation);
    window.addEventListener(
      PROJECT_ACTIVITY_REMOTE_EVENT,
      handleRemoteActivity
    );
    return () => {
      latestRequest.current += 1;
      window.removeEventListener(
        PROJECT_ACTIVITY_MUTATION_EVENT,
        handleMutation
      );
      window.removeEventListener(
        PROJECT_ACTIVITY_REMOTE_EVENT,
        handleRemoteActivity
      );
    };
  }, [projectId, refresh]);

  return summary;
}
