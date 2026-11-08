export const MAX_AGENT_DESCRIPTIVE_LABELS = 5;
export const MAX_AGENT_DESCRIPTIVE_LABEL_LENGTH = 40;
export const AGENT_DESCRIPTIVE_LABELS_HINT =
  "Up to 5 distinct labels, 40 characters each.";

export const AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR =
  "Add the pending label with Enter, or clear the input before saving.";

/** Credential descriptions only; never used for authorization or task labels. */
export function parseAgentCredentialDescriptiveLabels(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const label = entry.trim();
    if (
      !label ||
      label.length > MAX_AGENT_DESCRIPTIVE_LABEL_LENGTH ||
      label.includes(",") ||
      /[\u0000-\u001f\u007f]/.test(label)
    ) return null;
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      labels.push(label);
      if (labels.length > MAX_AGENT_DESCRIPTIVE_LABELS) return null;
    }
  }
  return labels;
}
