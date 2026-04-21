import { prisma } from "@/lib/prisma";
import { resolveAvatarSeed } from "@/lib/avatar";
import { validateUsernameDiscriminator } from "@/lib/services/account-security-policy";

interface AccountIdentitySummary {
  displayName: string;
  username: string | null;
  usernameDiscriminator: string | null;
  usernameTag: string | null;
  avatarSeed: string;
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

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

export async function getAccountIdentitySummary(
  actorUserId: string
): Promise<AccountIdentitySummary | null> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedActorUserId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      usernameDiscriminator: true,
      avatarSeed: true,
    },
  });

  if (!user) {
    return null;
  }

  const usernameDiscriminator = validateUsernameDiscriminator(
    user.usernameDiscriminator ?? ""
  )
    ? user.usernameDiscriminator
    : null;
  const usernameTag = buildUsernameTag(user.username, usernameDiscriminator);
  const emailLocalPart = getEmailLocalPart(user.email);
  const displayName =
    user.username ??
    user.name ??
    emailLocalPart ??
    "Account";

  return {
    displayName,
    username: user.username ?? null,
    usernameDiscriminator,
    usernameTag,
    avatarSeed: resolveAvatarSeed(user.avatarSeed, user.id),
  };
}
