import { getRuntimeEnvironment } from "@/lib/env.server";

type LogLevel = "info" | "warn" | "error";

type LogMetadata = Record<string, unknown>;

interface BaseLogPayload {
  timestamp: string;
  level: LogLevel;
  scope: string;
  runtimeEnvironment: string;
}

function emitLog(
  level: LogLevel,
  scope: string,
  message: string,
  metadata: LogMetadata = {}
): void {
  const payload: BaseLogPayload & {
    message: string;
    metadata: LogMetadata;
  } = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    runtimeEnvironment: getRuntimeEnvironment(),
    message,
    metadata,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

function normalizeError(error: unknown): LogMetadata {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? null,
    };
  }

  if (typeof error === "string") {
    return { errorMessage: error };
  }

  return { errorMessage: "Unknown error type", error };
}

export function logServerInfo(
  scope: string,
  message: string,
  metadata: LogMetadata = {}
): void {
  emitLog("info", scope, message, metadata);
}

export function logServerWarning(
  scope: string,
  message: string,
  metadata: LogMetadata = {}
): void {
  emitLog("warn", scope, message, metadata);
}

export function logServerError(
  scope: string,
  error: unknown,
  metadata: LogMetadata = {}
): void {
  emitLog("error", scope, "Unhandled server error", {
    ...metadata,
    ...normalizeError(error),
  });
}

