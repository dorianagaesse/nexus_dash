import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  MAX_GOOGLE_CALENDAR_ID_LENGTH,
  findGoogleCalendarCredentialCalendarId,
  normalizeGoogleCalendarId,
  updateGoogleCalendarCredentialCalendarId,
} from "@/lib/services/google-calendar-credential-service";

interface AccountSettingsSuccess<T extends Record<string, unknown>> {
  ok: true;
  status: number;
  data: T;
}

interface AccountSettingsError {
  ok: false;
  status: number;
  error: string;
}

type AccountSettingsResult<T extends Record<string, unknown>> =
  | AccountSettingsSuccess<T>
  | AccountSettingsError;

interface UpdateGoogleCalendarTargetInput {
  actorUserId: string;
  calendarIdRaw: string;
  subjectUserId?: string;
}

function normalizeUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string") {
    return "";
  }

  return userId.trim();
}

function createError(status: number, error: string): AccountSettingsError {
  return {
    ok: false,
    status,
    error,
  };
}

function createSuccess<T extends Record<string, unknown>>(
  status: number,
  data: T
): AccountSettingsSuccess<T> {
  return {
    ok: true,
    status,
    data,
  };
}

function hasValidCalendarIdLength(calendarIdRaw: string): boolean {
  return calendarIdRaw.trim().length <= MAX_GOOGLE_CALENDAR_ID_LENGTH;
}

export async function getGoogleCalendarTargetSettings(
  actorUserId: string
): Promise<
  AccountSettingsResult<{
    calendarId: string;
    hasCalendarConnection: boolean;
  }>
> {
  const normalizedActorUserId = normalizeUserId(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const calendarId = await findGoogleCalendarCredentialCalendarId(
    normalizedActorUserId
  );

  if (!calendarId) {
    return createSuccess(200, {
      calendarId: DEFAULT_GOOGLE_CALENDAR_ID,
      hasCalendarConnection: false,
    });
  }

  return createSuccess(200, {
    calendarId,
    hasCalendarConnection: true,
  });
}

export async function updateGoogleCalendarTargetSettings(
  input: UpdateGoogleCalendarTargetInput
): Promise<
  AccountSettingsResult<{
    calendarId: string;
  }>
> {
  const normalizedActorUserId = normalizeUserId(input.actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const normalizedSubjectUserId = normalizeUserId(input.subjectUserId);
  const subjectUserId = normalizedSubjectUserId || normalizedActorUserId;

  if (subjectUserId !== normalizedActorUserId) {
    return createError(403, "forbidden");
  }

  if (!hasValidCalendarIdLength(input.calendarIdRaw)) {
    return createError(400, "invalid-calendar-id");
  }

  const normalizedCalendarId = normalizeGoogleCalendarId(input.calendarIdRaw);
  const didUpdate = await updateGoogleCalendarCredentialCalendarId({
    userId: normalizedActorUserId,
    calendarId: normalizedCalendarId,
  });

  if (!didUpdate) {
    return createError(409, "calendar-not-connected");
  }

  return createSuccess(200, {
    calendarId: normalizedCalendarId,
  });
}
