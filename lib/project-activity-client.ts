"use client";

import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import { readProjectActivityVersionHeader } from "@/lib/project-activity-version";

export const PROJECT_ACTIVITY_ACK_EVENT = "nexusdash:project-activity-ack";
export const PROJECT_ACTIVITY_MUTATION_EVENT =
  "nexusdash:project-activity-mutation";
export const PROJECT_ACTIVITY_REMOTE_EVENT = "nexusdash:project-activity-remote";

export interface ProjectActivityAcknowledgementDetail {
  projectId: string;
  version: string;
}

export interface ProjectActivityMutationDetail {
  projectId: string;
  phase: "start" | "finish";
}

export interface ProjectActivityRemoteEventDetail {
  activity: ProjectActivityEventPayload;
  handled: boolean;
  markHandled: () => void;
}

function dispatchProjectActivityMutation(
  projectId: string,
  phase: ProjectActivityMutationDetail["phase"]
) {
  if (typeof window === "undefined" || !projectId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ProjectActivityMutationDetail>(
      PROJECT_ACTIVITY_MUTATION_EVENT,
      {
        detail: {
          projectId,
          phase,
        },
      }
    )
  );
}

export function beginProjectActivityMutation(projectId: string): () => void {
  dispatchProjectActivityMutation(projectId, "start");
  let finished = false;

  return () => {
    if (finished) {
      return;
    }

    finished = true;
    dispatchProjectActivityMutation(projectId, "finish");
  };
}

export function acknowledgeProjectActivity(
  projectId: string,
  version: string | null | undefined
): boolean {
  if (typeof window === "undefined" || !projectId || !version) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent<ProjectActivityAcknowledgementDetail>(
      PROJECT_ACTIVITY_ACK_EVENT,
      {
        detail: {
          projectId,
          version,
        },
      }
    )
  );
  return true;
}

export function acknowledgeProjectActivityFromResponse(
  projectId: string,
  response: Response
): boolean {
  return acknowledgeProjectActivity(
    projectId,
    readProjectActivityVersionHeader(response)
  );
}

export function dispatchProjectActivityRemoteEvent(
  activity: ProjectActivityEventPayload
): boolean {
  if (typeof window === "undefined" || !activity.projectId) {
    return false;
  }

  const detail: ProjectActivityRemoteEventDetail = {
    activity,
    handled: false,
    markHandled() {
      detail.handled = true;
    },
  };

  window.dispatchEvent(
    new CustomEvent<ProjectActivityRemoteEventDetail>(
      PROJECT_ACTIVITY_REMOTE_EVENT,
      {
        detail,
      }
    )
  );

  return detail.handled;
}

export async function fetchProjectActivityMutation(
  projectId: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const finishMutation = beginProjectActivityMutation(projectId);
  try {
    const response = await fetch(input, init);
    if (response.ok) {
      acknowledgeProjectActivityFromResponse(projectId, response);
    }
    return response;
  } finally {
    finishMutation();
  }
}
