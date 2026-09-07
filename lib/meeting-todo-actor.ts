import { normalizeMeetingParticipantName } from "@/lib/meeting-participant";

export type MeetingTodoActorKind = "human" | "agent" | "participant";
export type MeetingTodoActorStatus =
  | "active"
  | "inactive"
  | "revoked"
  | "expired";

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
  return `${actor.kind}:${actor.id}`;
}

export function getHistoricalMeetingTodoActorId(input: {
  kind: MeetingTodoActorKind;
  displayNameSnapshot: string;
}): string {
  return `historical-${input.kind}-${encodeURIComponent(
    input.displayNameSnapshot.trim()
  )}`;
}

export function isMeetingTodoActorReference(
  value: unknown
): value is MeetingTodoActorReference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.kind === "human" ||
      record.kind === "agent" ||
      record.kind === "participant") &&
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
  const normalizedDisplayName = normalizeMeetingParticipantName(
    input.displayName
  );
  const displayName =
    normalizedDisplayName || "Former meeting participant";
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
