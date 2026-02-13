import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";

export const MAX_TASK_LABELS = 8;
export const MAX_TASK_LABEL_LENGTH = 40;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeTaskLabel(value: string): string {
  return normalizeWhitespace(value).slice(0, MAX_TASK_LABEL_LENGTH);
}

export function normalizeTaskLabels(values: string[]): string[] {
  const normalizedLabels: string[] = [];
  const seenLabels = new Set<string>();

  for (const value of values) {
    const normalizedLabel = normalizeTaskLabel(value);
    if (!normalizedLabel) {
      continue;
    }

    const dedupeKey = normalizedLabel.toLowerCase();
    if (seenLabels.has(dedupeKey)) {
      continue;
    }

    seenLabels.add(dedupeKey);
    normalizedLabels.push(normalizedLabel);

    if (normalizedLabels.length >= MAX_TASK_LABELS) {
      break;
    }
  }

  return normalizedLabels;
}

export function parseTaskLabelsJson(rawValue: string): string[] {
  if (!rawValue) {
    return [];
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    return [];
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  const labels = parsedValue.filter(
    (entry): entry is string => typeof entry === "string"
  );
  return normalizeTaskLabels(labels);
}

export function serializeTaskLabels(labels: string[]): string | null {
  const normalizedLabels = normalizeTaskLabels(labels);
  if (normalizedLabels.length === 0) {
    return null;
  }
  return JSON.stringify(normalizedLabels);
}

export function getTaskLabelsFromStorage(
  labelsJson: string | null,
  legacyLabel: string | null
): string[] {
  const labelsFromJson = parseTaskLabelsJson(labelsJson ?? "");
  if (labelsFromJson.length > 0) {
    return labelsFromJson;
  }

  if (!legacyLabel) {
    return [];
  }

  return normalizeTaskLabels([legacyLabel]);
}

export function getTaskLabelColor(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 2147483647;
  }

  return CONTEXT_CARD_COLORS[Math.abs(hash) % CONTEXT_CARD_COLORS.length];
}
