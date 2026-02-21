import { getOptionalServerEnv, getRuntimeEnvironment } from "@/lib/env.server";
import { prisma } from "@/lib/prisma";

const BOOTSTRAP_USER_ID = "bootstrap-owner";
const BOOTSTRAP_USER_NAME = "Bootstrap Owner";
const BOOTSTRAP_USER_EMAIL = "bootstrap@nexusdash.local";
const LEGACY_ACTOR_USER_ID_ENV = "NEXUSDASH_LEGACY_ACTOR_USER_ID";

function normalizeUserId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureUserById(userId: string): Promise<void> {
  if (userId === BOOTSTRAP_USER_ID) {
    await prisma.user.upsert({
      where: { id: BOOTSTRAP_USER_ID },
      update: {
        name: BOOTSTRAP_USER_NAME,
        email: BOOTSTRAP_USER_EMAIL,
      },
      create: {
        id: BOOTSTRAP_USER_ID,
        name: BOOTSTRAP_USER_NAME,
        email: BOOTSTRAP_USER_EMAIL,
      },
    });
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.user.create({
    data: {
      id: userId,
      name: `Legacy Actor (${userId.slice(0, 12)})`,
    },
  });
}

export async function resolveActorUserId(input?: {
  preferredUserId?: string | null;
}): Promise<string> {
  const preferredUserId = normalizeUserId(input?.preferredUserId);
  const configuredActorUserId = normalizeUserId(
    getOptionalServerEnv(LEGACY_ACTOR_USER_ID_ENV)
  );
  const runtimeEnvironment = getRuntimeEnvironment();

  if (runtimeEnvironment === "test") {
    return preferredUserId ?? configuredActorUserId ?? BOOTSTRAP_USER_ID;
  }

  if (runtimeEnvironment !== "production") {
    const preferred = preferredUserId ?? configuredActorUserId;
    if (preferred) {
      await ensureUserById(preferred);
      return preferred;
    }
  }

  await ensureUserById(BOOTSTRAP_USER_ID);
  return BOOTSTRAP_USER_ID;
}
