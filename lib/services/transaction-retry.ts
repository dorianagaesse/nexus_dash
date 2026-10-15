/** PostgreSQL aborts these transactions before any writes can be committed. */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, meta } = error as { code?: unknown; meta?: { code?: unknown } };
  return code === "P2034" || code === "40P01" || code === "40001" ||
    (code === "P2010" && (meta?.code === "40P01" || meta?.code === "40001"));
}

/** The operation must open a fresh transaction and reauthorize on every try. */
export async function retryTransaction<T>(
  operation: () => Promise<T>,
  enabled: boolean
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!enabled || attempt >= 2 || !isRetryableTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
