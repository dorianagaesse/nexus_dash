export interface ServerSentEventInput {
  event?: string;
  id?: string;
  retry?: number;
  data?: unknown;
  comment?: string;
}

function sanitizeServerSentEventField(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

export function encodeServerSentEvent(input: ServerSentEventInput): string {
  const lines: string[] = [];

  if (input.comment) {
    lines.push(`: ${input.comment.replace(/\r?\n/g, "\n: ")}`);
  }

  if (input.retry != null) {
    lines.push(`retry: ${Math.max(0, Math.floor(input.retry))}`);
  }

  if (input.id) {
    lines.push(`id: ${sanitizeServerSentEventField(input.id)}`);
  }

  if (input.event) {
    lines.push(`event: ${sanitizeServerSentEventField(input.event)}`);
  }

  if (input.data !== undefined) {
    const serialized =
      typeof input.data === "string" ? input.data : JSON.stringify(input.data);
    for (const line of serialized.split(/\r?\n/)) {
      lines.push(`data: ${line}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function sleepWithAbort(
  delayMs: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, delayMs);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
