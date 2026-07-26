export interface ProjectMeetingParticipantIdentity {
  userId: string | null;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string | null;
}

export interface ProjectMeetingParticipantInput {
  userId?: string | null;
  displayName: string;
}

export interface ProjectMeetingParticipantCollaborator {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
  projectRole: "owner" | "editor" | "viewer";
}

export function normalizeMeetingParticipantName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getMeetingParticipantKey(
  participant: Pick<ProjectMeetingParticipantIdentity, "userId" | "displayName">
): string {
  return participant.userId
    ? `user:${participant.userId}`
    : `external:${normalizeMeetingParticipantName(
        participant.displayName
      ).toLocaleLowerCase()}`;
}

export function getMeetingParticipantInitials(displayName: string): string {
  const words = normalizeMeetingParticipantName(displayName)
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last =
    words.length > 1
      ? Array.from(words[words.length - 1] ?? "")[0] ?? ""
      : "";

  return `${first}${last}`.toUpperCase() || "?";
}
