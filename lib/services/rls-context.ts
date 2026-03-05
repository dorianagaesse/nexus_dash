import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type DbClient = Prisma.TransactionClient | typeof prisma;

function normalizeActorUserId(actorUserId: string): string {
  return actorUserId.trim();
}

export async function withActorRlsContext<T>(
  actorUserId: string,
  operation: (db: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    throw new Error("unauthorized");
  }

  if (process.env.NODE_ENV === "test") {
    return operation(prisma as unknown as Prisma.TransactionClient);
  }

  return prisma.$transaction(async (db) => {
    if (typeof db.$executeRaw === "function") {
      await db.$executeRaw`SELECT set_config('app.user_id', ${normalizedActorUserId}, true)`;
    }
    return operation(db);
  });
}
