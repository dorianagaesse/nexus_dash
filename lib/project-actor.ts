// Canonical project-scoped actor vocabulary shared by every actor surface
// (meeting todos, context cards, and task attribution). Meeting-todo and
// context-card modules re-export these names so consumers keep their own
// vocabulary while behavior stays implemented once.

export type ProjectActorKind = "human" | "agent";
export type ProjectActorStatus = "active" | "inactive" | "revoked" | "expired";

export interface ProjectActorReference {
  kind: ProjectActorKind;
  id: string;
}

export interface ProjectActorSummary extends ProjectActorReference {
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string | null;
  status: ProjectActorStatus;
  isAssignable: boolean;
}

export function getProjectActorKey(
  actor: Pick<ProjectActorReference, "kind" | "id">
): string {
  return `${actor.kind}:${actor.id}`;
}

export function hasProjectActorChanged(
  stored: Pick<ProjectActorReference, "kind" | "id"> | null,
  draft: Pick<ProjectActorReference, "kind" | "id"> | null
): boolean {
  if (!stored || !draft) {
    return Boolean(stored) !== Boolean(draft);
  }
  return getProjectActorKey(stored) !== getProjectActorKey(draft);
}

export function getHistoricalProjectActorId(input: {
  kind: ProjectActorKind;
  displayNameSnapshot: string;
}): string {
  return `historical-${input.kind}-${encodeURIComponent(
    input.displayNameSnapshot.trim()
  )}`;
}

export function isProjectActorReference(
  value: unknown
): value is ProjectActorReference {
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
