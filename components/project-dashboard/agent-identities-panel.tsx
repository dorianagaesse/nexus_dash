"use client";

import { useCallback, useEffect, useState } from "react";
import { AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { Button } from "@/components/ui/button";

type Session = {
  id: string;
  client: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  endedAt: string | null;
};
type Device = {
  id: string;
  name: string;
  scopes: AgentScope[];
  canMoveTasksToDone: boolean;
  authorizedAt: string | null;
  pairingExpiresAt: string;
  expiresAt: string;
  revokedAt: string | null;
  sessions: Session[];
};
type Identity = {
  id: string;
  name: string;
  roleLabel: string | null;
  identityMode: boolean;
  revokedAt: string | null;
  expiresAt: string | null;
  scopes: AgentScope[];
  canMoveTasksToDone: boolean;
  devices: Device[];
  auditEvents: {
    id: string;
    action: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }[];
};
const initialScopes: AgentScope[] = ["project:read", "task:read", "task:write"];
const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const date = (v: string) => new Date(v).toLocaleString();

function ScopeChoices({
  scopes,
  onChange,
  allowed,
}: {
  scopes: AgentScope[];
  onChange: (v: AgentScope[]) => void;
  allowed?: AgentScope[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Permissions</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {AGENT_SCOPE_DEFINITIONS.filter(
          (s) => !allowed || allowed.includes(s.scope)
        ).map((s) => (
          <label key={s.scope} className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={scopes.includes(s.scope)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...scopes, s.scope]
                    : scopes.filter((v) => v !== s.scope)
                )
              }
            />
            <span>
              {s.label}
              <span className="block text-xs text-muted-foreground">
                {s.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AgentIdentitiesPanel({ projectId }: { projectId: string }) {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>(initialScopes);
  const [done, setDone] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [deviceScopes, setDeviceScopes] = useState<AgentScope[]>([]);
  const [deviceDone, setDeviceDone] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appOrigin, setAppOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const selected = identities.find((i) => i.id === selectedId);
  // Edits and refreshes can remove grants while a device draft stays open.
  const effectiveDeviceScopes = deviceScopes.filter((scope) =>
    selected?.scopes.includes(scope)
  );
  const effectiveDeviceDone = deviceDone && !!selected?.canMoveTasksToDone;
  const endpoint = `/api/projects/${projectId}/agent-identities`;
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok)
      throw new Error("Agent identities could not be loaded. Try refreshing.");
    const data = await response.json();
    setIdentities(data.identities);
  }, [endpoint]);
  useEffect(() => {
    setAppOrigin(window.location.origin);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  const mutate = async (command: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          `Change could not be saved (${data.error}). Review the fields and try again.`
        );
      await refresh();
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.identityId) {
        setSelectedId(data.identityId);
        setDeviceScopes(scopes);
        setDeviceDone(done);
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Change could not be saved. Try again."
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const select = (identity: Identity) => {
    setSelectedId(identity.id);
    setEditing(false);
    setPairingCode(null);
    setConfirmDeactivate(false);
    setDeviceName("");
    setDeviceScopes(identity.scopes);
    setDeviceDone(identity.canMoveTasksToDone);
  };
  return (
    <section aria-label="Agent identities" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Agent identities</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One agent across devices and coding clients. Every launch has its
            own session.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || loading}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Refresh failed. Try again."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh identities
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setSelectedId(null);
              setName("");
              setRoleLabel("");
              setScopes(initialScopes);
              setDone(false);
              setEditing(true);
              setPairingCode(null);
            }}
          >
            New identity
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setError(null);
              void refresh().catch((e) => setError(e.message));
            }}
          >
            Refresh
          </button>
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading identities…
        </p>
      ) : !identities.length && !editing ? (
        <p className="text-sm text-muted-foreground">
          Create an identity, choose its permissions, then authorize a device to
          start working.
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {identities.map((identity) => (
          <button
            type="button"
            key={identity.id}
            aria-label={`${identity.name} ${identity.roleLabel ?? ""}`.trim()}
            aria-pressed={selectedId === identity.id}
            onClick={() => select(identity)}
            className={`flex w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === identity.id ? "bg-muted" : ""}`}
          >
            <span>
              <span className="font-medium">{identity.name}</span>
              {identity.roleLabel && (
                <span className="ml-2 text-muted-foreground">
                  {identity.roleLabel}
                </span>
              )}
              <span className="mt-1 block text-xs text-muted-foreground">
                {identity.scopes.length} permissions ·{" "}
                {
                  identity.devices.filter(
                    (d) => !d.revokedAt && new Date(d.expiresAt) > new Date()
                  ).length
                }{" "}
                authorized devices
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {identity.revokedAt
                ? "Inactive"
                : identity.expiresAt &&
                    new Date(identity.expiresAt) <= new Date()
                  ? "Expired"
                  : "Active"}
            </span>
          </button>
        ))}
      </div>
      {editing && (
        <form
          className="space-y-4 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate({
                operation: selected ? "update" : "create",
                identityId: selectedId,
                name,
                roleLabel,
                scopes,
                canMoveTasksToDone: done,
              })
            )
              setEditing(false);
          }}
        >
          <h4 className="font-medium">
            {selected ? `Edit ${selected.name}` : "Create identity"}
          </h4>
          <label className="block space-y-1 text-sm">
            Name
            <input
              autoFocus
              required
              maxLength={80}
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Role label (optional)
            <input
              maxLength={80}
              className={fieldClass}
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="Orchestrator"
            />
          </label>
          <ScopeChoices scopes={scopes} onChange={setScopes} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => setDone(e.target.checked)}
            />
            Allow moving tasks to Done
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !scopes.length}>
              {busy
                ? "Saving…"
                : selected
                  ? "Save identity"
                  : "Create identity"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {selected && !editing && (
        <div className="space-y-5 border-t pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">{selected.name}</h4>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Identity: {selected.id}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.scopes.join(", ")} · Done moves{" "}
                {selected.canMoveTasksToDone ? "allowed" : "denied"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !!selected.revokedAt}
              onClick={() => {
                setName(selected.name);
                setRoleLabel(selected.roleLabel ?? "");
                setScopes(selected.scopes);
                setDone(selected.canMoveTasksToDone);
                setEditing(true);
              }}
            >
              Edit identity
            </Button>
          </div>
          <div>
            <h5 className="mb-2 text-sm font-medium">Devices and sessions</h5>
            {!selected.devices.length && (
              <p className="text-sm text-muted-foreground">
                No devices authorized yet.
              </p>
            )}
            <ul className="divide-y divide-border">
              {selected.devices.map((d) => (
                <li key={d.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <strong className="font-medium">{d.name}</strong>
                      <span className="ml-2 text-muted-foreground">
                        {d.revokedAt
                          ? "Revoked"
                          : new Date(d.expiresAt) <= new Date()
                            ? "Expired"
                            : d.authorizedAt
                              ? "Connected"
                              : new Date(d.pairingExpiresAt) <= new Date()
                                ? "Pairing expired"
                                : "Awaiting pairing"}
                      </span>
                    </div>
                    {!d.revokedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            operation: "revoke-device",
                            identityId: selected.id,
                            deviceId: d.id,
                          })
                        }
                      >
                        Revoke {d.name}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expires {date(d.expiresAt)} · Done moves{" "}
                    {d.canMoveTasksToDone && selected.canMoveTasksToDone
                      ? "allowed"
                      : "denied"}
                    <br />
                    Effective permissions:{" "}
                    {d.scopes
                      .filter((s) => selected.scopes.includes(s))
                      .join(", ") || "None"}
                  </p>
                  {d.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 pl-3 text-xs"
                    >
                      <span className="min-w-0 break-all">
                        {s.client} ·{" "}
                        {s.endedAt
                          ? "Ended"
                          : new Date(s.expiresAt) <= new Date()
                            ? "Expired"
                            : "Active"}
                        <br />
                        <span className="text-muted-foreground">
                          {s.id} · Last active {date(s.lastActiveAt)}
                        </span>
                      </span>
                      {!s.endedAt && new Date(s.expiresAt) > new Date() && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              operation: "end-session",
                              identityId: selected.id,
                              sessionId: s.id,
                            })
                          }
                        >
                          End session
                        </Button>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
          {!selected.revokedAt && (
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium">
                Authorize a device
              </summary>
              <form
                className="mt-3 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!effectiveDeviceScopes.length) return;
                  await mutate({
                    operation: "authorize-device",
                    identityId: selected.id,
                    name: deviceName,
                    scopes: effectiveDeviceScopes,
                    canMoveTasksToDone: effectiveDeviceDone,
                  });
                }}
              >
                <p className="text-sm text-muted-foreground">
                  Authorize this device for {selected.name} only, for 90 days.
                  Its permissions cannot exceed this identity’s permissions.
                </p>
                <label className="block space-y-1 text-sm">
                  Device name
                  <input
                    className={fieldClass}
                    required
                    maxLength={80}
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="Work laptop"
                  />
                </label>
                <ScopeChoices
                  scopes={effectiveDeviceScopes}
                  onChange={setDeviceScopes}
                  allowed={selected.scopes}
                />
                {selected.canMoveTasksToDone && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={effectiveDeviceDone}
                      onChange={(e) => setDeviceDone(e.target.checked)}
                    />
                    Allow Done moves from this device
                  </label>
                )}
                <Button
                  type="submit"
                  disabled={busy || !effectiveDeviceScopes.length}
                >
                  Generate pairing code
                </Button>
              </form>
            </details>
          )}
          {pairingCode && (
            <div
              role="status"
              className="space-y-2 rounded-md border border-border p-3 text-sm"
            >
              <p className="font-medium">Pair this device within 10 minutes</p>
              <p>
                Run the login command in your own terminal, then paste the
                one-time code when prompted.
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">
                node scripts/nd-agent.mjs login --base {appOrigin} --project{" "}
                {projectId} --identity {selected.id}
              </pre>
              <code className="block select-all break-all" data-pairing-code>
                {pairingCode}
              </code>
              <p className="text-xs text-muted-foreground">
                Keep this code private. It can be used once.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPairingCode(null)}
              >
                Dismiss pairing code
              </Button>
            </div>
          )}
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Recent activity
            </summary>
            <ul className="mt-2 space-y-2">
              {selected.auditEvents.map((a) => (
                <li key={a.id} className="text-xs">
                  <span>
                    {String(a.metadata?.operation ?? a.action).replaceAll(
                      "_",
                      " "
                    )}
                    {a.metadata?.client ? ` · ${a.metadata.client}` : ""}
                    {a.metadata?.deviceName
                      ? ` · ${a.metadata.deviceName}`
                      : ""}
                    {a.metadata?.path ? ` · ${a.metadata.path}` : ""}
                  </span>
                  <span className="block text-muted-foreground">
                    {date(a.createdAt)}
                    {a.metadata?.sessionId
                      ? ` · Session ${a.metadata.sessionId}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          {!selected.revokedAt && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Deactivating ends all access. Assignments, mentions and
                historical contributions remain attached to this identity.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (!confirmDeactivate) setConfirmDeactivate(true);
                  else
                    void mutate({
                      operation: "deactivate",
                      identityId: selected.id,
                    });
                }}
              >
                {confirmDeactivate
                  ? `Confirm deactivate ${selected.name}`
                  : "Deactivate identity"}
              </Button>
              {confirmDeactivate && (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDeactivate(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
