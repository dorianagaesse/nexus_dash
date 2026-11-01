import type { ServiceErrorResult } from "./task-types";

export function createError(
  status: number,
  error: string,
  invalidRelatedTask?: ServiceErrorResult["invalidRelatedTask"]
): ServiceErrorResult {
  return {
    ok: false,
    status,
    error,
    ...(invalidRelatedTask ? { invalidRelatedTask } : {}),
  };
}

export function isPrismaNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2025";
}
