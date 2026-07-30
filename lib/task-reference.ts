const TASK_REFERENCE_PREFIX = "ND";

export function formatTaskReference(referenceNumber: number): string;
export function formatTaskReference(
  referenceNumber: null | undefined
): undefined;
export function formatTaskReference(
  referenceNumber: number | null | undefined
): string | undefined {
  if (referenceNumber == null) {
    return undefined;
  }

  if (!Number.isSafeInteger(referenceNumber) || referenceNumber < 1) {
    throw new Error("task-reference-number-invalid");
  }

  return `${TASK_REFERENCE_PREFIX}-${referenceNumber}`;
}
