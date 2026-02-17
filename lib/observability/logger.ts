import { getRuntimeEnvironment } from "@/lib/env.server";

type LogLevel = "info" | "warn" | "error";

type LogMetadata = Record<string, unknown>;

interface BaseLogPayload {
  timestamp: string;
  level: LogLevel;
  scope: string;
  runtimeEnvironment: string;
}

function serializeError(error: Error): LogMetadata {
  return {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack ?? null,
  };
}

function safeStringify(payload: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(payload, (_key, value: unknown) => {
    if (value instanceof Error) {
      return serializeError(value);
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value && typeof value === "object") {
      const objectValue = value as object;
      if (seen.has(objectValue)) {
        return "[Circular]";
      }
      seen.add(objectValue);
    }

    return value;
  });
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

  const line = safeStringify(payload);
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
    return serializeError(error);
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

