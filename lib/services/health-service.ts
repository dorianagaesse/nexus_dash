import { prisma } from "@/lib/prisma";

const READINESS_DB_TIMEOUT_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Database readiness check timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function checkDatabaseReadiness(): Promise<void> {
  await withTimeout(prisma.$queryRaw`SELECT 1`, READINESS_DB_TIMEOUT_MS);
}

