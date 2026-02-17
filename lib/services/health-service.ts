import { prisma } from "@/lib/prisma";

export async function checkDatabaseReadiness(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

