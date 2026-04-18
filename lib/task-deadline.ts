const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const TASK_DEADLINE_SOON_DAYS = 3;

export type TaskDeadlineUrgency = "none" | "soon" | "overdue";

function padDateSegment(value: number): string {
  return value.toString().padStart(2, "0");
}

function normalizeDateOnlyParts(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidTaskDeadlineDate(value: string): boolean {
  return normalizeDateOnlyParts(value) !== null;
}

export function parseTaskDeadlineDate(value: string): Date | null {
  const normalizedValue = value.trim();
  const parts = normalizeDateOnlyParts(normalizedValue);
  if (!parts) {
    return null;
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function formatTaskDeadlineDate(
  value: Date | string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (isValidTaskDeadlineDate(normalizedValue)) {
      return normalizedValue;
    }

    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return formatTaskDeadlineDate(parsed);
  }

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return [
    value.getUTCFullYear(),
    padDateSegment(value.getUTCMonth() + 1),
    padDateSegment(value.getUTCDate()),
  ].join("-");
}

export function getLocalCalendarDateString(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    padDateSegment(now.getMonth() + 1),
    padDateSegment(now.getDate()),
  ].join("-");
}

function getDateOnlyUtcTimestamp(value: string): number | null {
  const parsed = parseTaskDeadlineDate(value);
  if (!parsed) {
    return null;
  }

  return parsed.getTime();
}

export function getTaskDeadlineDayDelta(
  deadlineDate: string,
  now: Date = new Date()
): number | null {
  const deadlineTimestamp = getDateOnlyUtcTimestamp(deadlineDate);
  if (deadlineTimestamp === null) {
    return null;
  }

  const todayTimestamp = getDateOnlyUtcTimestamp(getLocalCalendarDateString(now));
  if (todayTimestamp === null) {
    return null;
  }

  return Math.round((deadlineTimestamp - todayTimestamp) / 86_400_000);
}

export function getTaskDeadlineUrgency(input: {
  deadlineDate: string | null | undefined;
  archivedAt?: string | null;
  status?: string | null;
  now?: Date;
  soonThresholdDays?: number;
}): TaskDeadlineUrgency {
  if (!input.deadlineDate) {
    return "none";
  }

  if (input.archivedAt || input.status === "Done") {
    return "none";
  }

  const dayDelta = getTaskDeadlineDayDelta(input.deadlineDate, input.now);
  if (dayDelta === null) {
    return "none";
  }

  if (dayDelta < 0) {
    return "overdue";
  }

  if (dayDelta <= (input.soonThresholdDays ?? TASK_DEADLINE_SOON_DAYS)) {
    return "soon";
  }

  return "none";
}

export function formatTaskDeadlineForDisplay(
  deadlineDate: string,
  locale?: string
): string {
  const parsed = parseTaskDeadlineDate(deadlineDate);
  if (!parsed) {
    return deadlineDate;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

