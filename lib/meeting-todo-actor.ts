import { normalizeMeetingParticipantName } from "@/lib/meeting-participant";
import {
  getHistoricalProjectActorId,
  getProjectActorKey,
  isProjectActorReference,
  type ProjectActorKind,
  type ProjectActorReference,
  type ProjectActorStatus,
  type ProjectActorSummary,
} from "@/lib/project-actor";

export type MeetingTodoActorKind = ProjectActorKind | "participant";
export type MeetingTodoActorStatus = ProjectActorStatus;

export interface MeetingTodoActorReference {
  kind: MeetingTodoActorKind;
  id: string;
}

export interface MeetingTodoActorSummary extends MeetingTodoActorReference {
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string | null;
  status: MeetingTodoActorStatus;
  isAssignable: boolean;
}

export function getMeetingTodoActorKey(
  actor: Pick<MeetingTodoActorReference, "kind" | "id">
): string {
  return actor.kind === "participant"
    ? `${actor.kind}:${actor.id}`
    : getProjectActorKey(actor as ProjectActorReference);
}

export function getHistoricalMeetingTodoActorId(input: {
  kind: MeetingTodoActorKind;
  displayNameSnapshot: string;
}): string {
  return input.kind === "participant"
    ? `historical-participant-${encodeURIComponent(
        input.displayNameSnapshot.trim()
      )}`
    : getHistoricalProjectActorId({
        kind: input.kind,
        displayNameSnapshot: input.displayNameSnapshot,
      });
}

export function isMeetingTodoActorReference(
  value: unknown
): value is MeetingTodoActorReference {
  if (isProjectActorReference(value)) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.kind === "participant" &&
    typeof record.id === "string" &&
    record.id.trim().length > 0
  );
}

export function getMeetingTodoParticipantNameKey(displayName: string): string {
  return normalizeMeetingParticipantName(displayName).toLowerCase();
}

export function buildExternalParticipantMeetingTodoActor(input: {
  displayName: string;
  isCurrentParticipant?: boolean;
}): MeetingTodoActorSummary {
  const normalizedDisplayName = normalizeMeetingParticipantName(input.displayName);
  const displayName = normalizedDisplayName || "Former meeting participant";
  const isCurrentParticipant =
    Boolean(normalizedDisplayName) && Boolean(input.isCurrentParticipant);
  return {
    kind: "participant",
    id: displayName,
    displayName,
    usernameTag: null,
    avatarSeed: null,
    status: isCurrentParticipant ? "active" : "inactive",
    isAssignable: isCurrentParticipant,
  };
}

export function isProjectMeetingTodoActor(
  actor: MeetingTodoActorSummary
): actor is ProjectActorSummary {
  return actor.kind === "human" || actor.kind === "agent";
}
