import { PrismaClient } from "@prisma/client";

import { isProductionEnvironment } from "@/lib/env.server";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (!isProductionEnvironment()) {
  globalForPrisma.prisma = prisma;
}
