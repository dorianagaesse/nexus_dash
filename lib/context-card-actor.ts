export type ContextCardActorKind = "human" | "agent";
export type ContextCardActorStatus =
  | "active"
  | "inactive"
  | "revoked"
  | "expired";

export interface ContextCardActorReference {
  kind: ContextCardActorKind;
  id: string;
}

export interface ContextCardActorSummary extends ContextCardActorReference {
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string | null;
  status: ContextCardActorStatus;
  isAssignable: boolean;
}

export function getContextCardActorKey(
  actor: Pick<ContextCardActorReference, "kind" | "id">
): string {
  return `${actor.kind}:${actor.id}`;
}

export function getHistoricalContextCardActorId(input: {
  kind: ContextCardActorKind;
  displayNameSnapshot: string;
}): string {
  return `historical-${input.kind}-${encodeURIComponent(
    input.displayNameSnapshot.trim()
  )}`;
}

export function isContextCardActorReference(
  value: unknown
): value is ContextCardActorReference {
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
