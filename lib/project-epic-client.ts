"use client";

import type { ProjectEpicSnapshot, TaskEpicSummary } from "@/lib/epic";

export const PROJECT_EPICS_RECONCILED_EVENT =
  "nexusdash:project-epics-reconciled";

export interface ProjectEpicsReconciledDetail {
  projectId: string;
  epics: ProjectEpicSnapshot[];
}

interface EpicVisibleTaskState {
  id: string;
  title: string;
  status: string;
  position: number;
  archivedAt: string | null;
  epic: TaskEpicSummary | null;
}

const activeRequests = new Map<string, AbortController>();
const latestSnapshots = new Map<string, ProjectEpicSnapshot[]>();

export function getLatestProjectEpicSnapshot(
  projectId: string
): ProjectEpicSnapshot[] | null {
  return latestSnapshots.get(projectId) ?? null;
}

export function discardLatestProjectEpicSnapshot(projectId: string): void {
  latestSnapshots.delete(projectId);
}

export function doesTaskMutationAffectProjectEpics(
  previousTask: EpicVisibleTaskState | null,
  nextTask: EpicVisibleTaskState | null
): boolean {
  const previousEpicId = previousTask?.epic?.id ?? null;
  const nextEpicId = nextTask?.epic?.id ?? null;

  if (!previousEpicId && !nextEpicId) {
    return false;
  }

  if (previousEpicId !== nextEpicId || !previousTask || !nextTask) {
    return true;
  }

  return (
    previousTask.title !== nextTask.title ||
    previousTask.status !== nextTask.status ||
    previousTask.position !== nextTask.position ||
    previousTask.archivedAt !== nextTask.archivedAt
  );
}

export async function reconcileProjectEpicsAfterTaskMutation(
  projectId: string,
  previousTask: EpicVisibleTaskState | null,
  nextTask: EpicVisibleTaskState | null
): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !projectId ||
    !doesTaskMutationAffectProjectEpics(previousTask, nextTask)
  ) {
    return false;
  }

  activeRequests.get(projectId)?.abort();
  const controller = new AbortController();
  activeRequests.set(projectId, controller);

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/epics`,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(
        `Epic reconciliation failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as {
      epics?: ProjectEpicSnapshot[];
    };
    if (!Array.isArray(payload.epics)) {
      throw new Error("Epic reconciliation returned an invalid payload");
    }

    if (activeRequests.get(projectId) !== controller) {
      return false;
    }

    latestSnapshots.set(projectId, payload.epics);

    window.dispatchEvent(
      new CustomEvent<ProjectEpicsReconciledDetail>(
        PROJECT_EPICS_RECONCILED_EVENT,
        {
          detail: {
            projectId,
            epics: payload.epics,
          },
        }
      )
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") {
      console.warn("[reconcileProjectEpicsAfterTaskMutation]", error);
    }
    return false;
  } finally {
    if (activeRequests.get(projectId) === controller) {
      activeRequests.delete(projectId);
    }
  }
}
