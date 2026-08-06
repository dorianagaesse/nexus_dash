import { AccountSettingsShell } from "@/components/account/account-settings-shell";
import { AppAboutCard } from "@/components/account/app-about-card";
import {
  CalendarConnectionsManager,
  type CalendarConnectionView,
} from "@/components/account/calendar-connections-manager";
import { Card, CardContent } from "@/components/ui/card";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import {
  getCalendarPreference,
  listCalendarConnections,
} from "@/lib/services/calendar-connection-service";

type SearchParams = Record<string, string | string[] | undefined>;

function readQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const actorUserId = await requireSessionUserIdFromServer();
  const resolvedSearchParams = await searchParams;
  const [connections, preference] = await Promise.all([
    listCalendarConnections(actorUserId),
    getCalendarPreference(actorUserId),
  ]);
  const error = readQueryValue(resolvedSearchParams?.error);
  const status = readQueryValue(resolvedSearchParams?.status);
  const returnTo = readQueryValue(resolvedSearchParams?.returnTo);
  const views: CalendarConnectionView[] = connections.map((connection) => ({
    ...connection,
    reauthorizationRequiredAt:
      connection.reauthorizationRequiredAt?.toISOString() ?? null,
    calendarListSyncedAt: connection.calendarListSyncedAt?.toISOString() ?? null,
  }));

  return (
    <AccountSettingsShell
      activeTab="calendar"
      title="Calendar connections"
      description="Connect accounts, choose visible calendars, and set one destination for events created in NexusDash."
      returnTo={returnTo}
    >
      {status === "calendar-connected" ? (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          Google Calendar connected and its calendars are ready to choose.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error === "calendar-reconnect-account-mismatch"
            ? "Reconnect with the same Google account shown on this card."
            : "Google Calendar could not be connected. Please retry."}
        </p>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          <CalendarConnectionsManager
            connections={views}
            writeSourceId={preference?.writeSourceId ?? null}
          />
        </CardContent>
      </Card>
      <AppAboutCard />
    </AccountSettingsShell>
  );
}
