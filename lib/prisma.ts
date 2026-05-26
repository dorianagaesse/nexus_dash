import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { getPrismaPgRuntimeConnectionString } from "@/lib/env.server";
import { installSerializedTransactionQueries } from "@/lib/pg-transaction-query-serialization";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Prisma interactive transactions borrow one pg client. Serialize driver
  // calls on that client so deep relation reads cannot trigger pg's query
  // queue deprecation warning while RLS context remains transaction-scoped.
  const pool = installSerializedTransactionQueries(new Pool({
    connectionString: getPrismaPgRuntimeConnectionString(),
  }));
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
