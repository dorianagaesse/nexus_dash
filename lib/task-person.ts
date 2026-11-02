import { resolveAvatarSeed } from "@/lib/avatar";
import { validateUsernameDiscriminator } from "@/lib/services/account-security-policy";

export interface TaskPersonSummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
}

export interface TaskPersonRecord {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  avatarSeed: string | null;
}

export const taskPersonSummarySelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  usernameDiscriminator: true,
  avatarSeed: true,
} as const;

function buildUsernameTag(
  username: string | null | undefined,
  usernameDiscriminator: string | null | undefined
): string | null {
  if (
    !username ||
    !usernameDiscriminator ||
    !validateUsernameDiscriminator(usernameDiscriminator)
  ) {
    return null;
  }

  return `${username}#${usernameDiscriminator}`;
}

function getEmailLocalPart(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }

  return email.split("@", 1)[0] ?? null;
}

export function mapTaskPersonSummary(
  input: TaskPersonRecord | null
): TaskPersonSummary | null {
  if (!input) {
    return null;
  }

  return {
    id: input.id,
    displayName:
      input.username ??
      input.name ??
      getEmailLocalPart(input.email) ??
      "Account",
    usernameTag: buildUsernameTag(input.username, input.usernameDiscriminator),
    avatarSeed: resolveAvatarSeed(input.avatarSeed, input.id),
  };
}
