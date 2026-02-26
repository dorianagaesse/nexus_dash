import { prisma } from "@/lib/prisma";

interface AccountIdentitySummary {
  displayName: string;
  username: string | null;
  usernameDiscriminator: string | null;
  usernameTag: string | null;
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
  if (!username || !usernameDiscriminator) {
    return null;
  }

  return `${username}#${usernameDiscriminator}`;
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
      name: true,
      email: true,
      username: true,
      usernameDiscriminator: true,
    },
  });

  if (!user) {
    return null;
  }

  const usernameTag = buildUsernameTag(user.username, user.usernameDiscriminator);
  const displayName =
    user.username ??
    user.name ??
    user.email?.split("@")[0] ??
    "Account";

  return {
    displayName,
    username: user.username ?? null,
    usernameDiscriminator: user.usernameDiscriminator ?? null,
    usernameTag,
  };
}
