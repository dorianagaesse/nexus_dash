"use client";

import { useMemo, useState } from "react";
import { RefreshCcw, Unplug, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface CalendarConnectionView {
  id: string;
  provider: string;
  accountEmail: string | null;
  accountLabel: string;
  reauthorizationRequiredAt: string | null;
  calendarListSyncedAt: string | null;
  sources: Array<{
    id: string;
    name: string;
    color: string | null;
    accessRole: string | null;
    isPrimary: boolean;
    isSelected: boolean;
  }>;
}

interface CalendarConnectionsManagerProps {
  connections: CalendarConnectionView[];
  writeSourceId: string | null;
}

function isWritable(role: string | null): boolean {
  return role === "owner" || role === "writer";
}

export function CalendarConnectionsManager({
  connections,
  writeSourceId,
}: CalendarConnectionsManagerProps) {
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(connections.flatMap((item) => item.sources.filter((source) => source.isSelected).map((source) => source.id)))
  );
  const [writeTarget, setWriteTarget] = useState(writeSourceId);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceIds = useMemo(
    () => new Set(connections.flatMap((connection) => connection.sources.map((source) => source.id))),
    [connections]
  );

  const run = async (key: string, request: () => Promise<Response>) => {
    setPendingAction(key);
    setMessage(null);
    setError(null);
    try {
      const response = await request();
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        revocationStatus?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error === "calendar-write-source-not-selected"
            ? "Keep the event target selected, or choose another writable calendar."
            : payload?.error === "calendar-sync-failed"
              ? "Some calendars could not be refreshed. Reconnect the affected Google account, then try again."
            : payload?.error ?? "Calendar update failed."
        );
      }
      setMessage(
        payload?.revocationStatus === "unconfirmed"
          ? "Disconnected locally. Review NexusDash in Google Account permissions because Google did not confirm revocation."
          : "Calendar settings updated. Refreshing…"
      );
      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Calendar update failed. Please retry."
      );
    } finally {
      setPendingAction(null);
      setDisconnectId(null);
    }
  };

  const savePreferences = () =>
    run("preferences", () =>
      fetch("/api/account/calendar-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSourceIds: [...selectedIds].filter((id) => sourceIds.has(id)),
          writeSourceId: writeTarget,
        }),
      })
    );

  const refreshAllCalendars = () =>
    run("sync-all", async () => {
      const responses = await Promise.all(
        connections.map((connection) =>
          fetch(`/api/account/calendar-connections/${connection.id}/sync`, {
            method: "POST",
          })
        )
      );
      const failedResponse = responses.find((response) => !response.ok);
      return failedResponse ?? new Response(JSON.stringify({ synced: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Connected accounts</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose calendars to show in projects and one writable target for new events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connections.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={pendingAction !== null}
              onClick={() => void refreshAllCalendars()}
            >
              <RefreshCcw className={pendingAction === "sync-all" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {pendingAction === "sync-all" ? "Refreshing…" : "Refresh all calendars"}
            </Button>
          ) : null}
          <Button asChild className="min-h-11">
            <a href="/api/auth/google?returnTo=%2Faccount%2Fsettings">
              <UserPlus className="h-4 w-4" /> Add Google account
            </a>
          </Button>
        </div>
      </div>

      {message ? (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No Calendar account is connected. Add Google to choose calendars.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {connections.map((connection) => (
            <section key={connection.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{connection.accountLabel}</h3>
                  {connection.accountEmail ? (
                    <p className="truncate text-sm text-muted-foreground">{connection.accountEmail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {connection.reauthorizationRequiredAt
                      ? "Reauthorization required"
                      : connection.calendarListSyncedAt
                        ? `Calendars refreshed ${new Date(connection.calendarListSyncedAt).toLocaleString()}`
                        : "Calendar list not refreshed yet"}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                  {connection.provider}
                </span>
              </div>

              <fieldset className="mt-4 space-y-2">
                <legend className="text-sm font-medium">Visible calendars</legend>
                {connection.sources.map((source) => (
                  <div
                    key={source.id}
                    className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      writeTarget === source.id
                        ? "border-primary/70 bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/60"
                    }`}
                  >
                    <input
                      id={`calendar-source-${source.id}`}
                      type="checkbox"
                      checked={selectedIds.has(source.id)}
                      onChange={(event) => {
                        const next = new Set(selectedIds);
                        if (event.target.checked) next.add(source.id);
                        else {
                          next.delete(source.id);
                          if (writeTarget === source.id) setWriteTarget(null);
                        }
                        setSelectedIds(next);
                      }}
                      className="h-5 w-5 rounded border-input"
                    />
                    <label htmlFor={`calendar-source-${source.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span aria-hidden className="h-3 w-3 rounded-full border" style={{ backgroundColor: source.color ?? "transparent" }} />
                        <span className="truncate">{source.name}</span>
                        {source.isPrimary ? <span className="text-xs text-muted-foreground">Primary</span> : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      aria-pressed={writeTarget === source.id}
                      aria-label={`Use ${source.name} for new events`}
                      title={isWritable(source.accessRole) ? "Use for new events" : "Read-only calendar"}
                      onClick={() => {
                        setWriteTarget(source.id);
                        setSelectedIds((current) => new Set(current).add(source.id));
                      }}
                      disabled={!isWritable(source.accessRole)}
                      className="min-h-9 shrink-0 rounded-md border border-border/70 px-2.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {writeTarget === source.id
                        ? "Event destination"
                        : isWritable(source.accessRole)
                          ? "Set destination"
                          : "Read only"}
                    </button>
                  </div>
                ))}
              </fieldset>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button asChild variant="outline" className="min-h-11">
                  <a href={`/api/auth/google?returnTo=%2Faccount%2Fsettings&connectionId=${encodeURIComponent(connection.id)}`}>
                    Reconnect
                  </a>
                </Button>
                <Button type="button" variant="destructive" className="min-h-11" disabled={pendingAction !== null} onClick={() => setDisconnectId(connection.id)}>
                  <Unplug className="h-4 w-4" /> Disconnect
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}

      {connections.length > 0 ? (
        <Button type="button" className="min-h-11" disabled={pendingAction !== null} onClick={() => void savePreferences()}>
          {pendingAction === "preferences" ? "Saving…" : "Save calendar choices"}
        </Button>
      ) : null}

      <ConfirmDialog
        isOpen={disconnectId !== null}
        title="Disconnect this Calendar account?"
        description="NexusDash will remove this account’s stored tokens and calendars. Events remain in Google Calendar."
        confirmLabel="Disconnect account"
        confirmingLabel="Disconnecting…"
        isConfirming={pendingAction?.startsWith("disconnect:") ?? false}
        onCancel={() => setDisconnectId(null)}
        onConfirm={() => {
          if (!disconnectId) return;
          void run(`disconnect:${disconnectId}`, () => fetch(`/api/account/calendar-connections/${disconnectId}`, { method: "DELETE" }));
        }}
      />
    </div>
  );
}
