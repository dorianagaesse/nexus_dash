export type MeetingTodoActorKind = "human" | "agent";
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

export function isMeetingTodoActorReference(
  value: unknown
): value is MeetingTodoActorReference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.kind === "human" || record.kind === "agent") &&
    typeof record.id === "string" &&
    record.id.trim().length > 0
  );
}
