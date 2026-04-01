import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountSettingsShell } from "@/components/account/account-settings-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  MAX_GOOGLE_CALENDAR_ID_LENGTH,
} from "@/lib/services/google-calendar-credential-service";
import { getGoogleCalendarTargetSettings } from "@/lib/services/account-settings-service";

import { updateGoogleCalendarSettingsAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  "calendar-updated": "Google Calendar target saved successfully.",
  "calendar-reset": "Google Calendar target reset to primary.",
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You must be signed in to access account settings.",
  forbidden: "You cannot update another user's settings.",
  "invalid-calendar-id":
    "Calendar ID is too long. Use 255 characters or fewer.",
  "calendar-not-connected":
    "Connect Google Calendar first before storing a custom target ID.",
  "update-failed": "Could not update settings. Please retry.",
};

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const actorUserId = await requireSessionUserIdFromServer();

  const settingsResult = await getGoogleCalendarTargetSettings(actorUserId);
  if (!settingsResult.ok) {
    notFound();
  }

  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);
  const currentCalendarId = settingsResult.data.calendarId;
  const hasCalendarConnection = settingsResult.data.hasCalendarConnection;

  return (
    <AccountSettingsShell
      activeTab="calendar"
      title="Google Calendar target"
      description="Choose which Google Calendar receives events created from NexusDash."
    >
      {status && STATUS_MESSAGES[status] ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {STATUS_MESSAGES[status]}
        </div>
      ) : null}

      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Calendar target ID</CardTitle>
          <CardDescription>
            Leave empty to use <code>{DEFAULT_GOOGLE_CALENDAR_ID}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            Current target: <code>{currentCalendarId}</code>
          </div>

          {!hasCalendarConnection ? (
            <p className="text-sm text-muted-foreground">
              Google Calendar is not connected yet. Connect it from a project dashboard,
              then return here to save a custom calendar ID.
            </p>
          ) : null}

          <form action={updateGoogleCalendarSettingsAction} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="calendarId" className="text-sm font-medium">
                Google Calendar ID
              </label>
              <input
                id="calendarId"
                name="calendarId"
                maxLength={MAX_GOOGLE_CALENDAR_ID_LENGTH}
                defaultValue={
                  currentCalendarId === DEFAULT_GOOGLE_CALENDAR_ID
                    ? ""
                    : currentCalendarId
                }
                placeholder={DEFAULT_GOOGLE_CALENDAR_ID}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!hasCalendarConnection}
              />
              <p className="text-xs text-muted-foreground">
                Example: your calendar email address or shared calendar ID.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!hasCalendarConnection}>
                Save settings
              </Button>
              <Button
                type="submit"
                name="intent"
                value="reset"
                variant="secondary"
                disabled={!hasCalendarConnection}
              >
                Use primary calendar
              </Button>
              <Button asChild variant="ghost">
                <Link href="/projects">Back to projects</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AccountSettingsShell>
  );
}
