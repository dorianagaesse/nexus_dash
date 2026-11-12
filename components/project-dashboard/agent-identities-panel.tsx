"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Laptop,
  Plus,
  RefreshCw,
} from "lucide-react";
import { AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { AgentCredentialLabelsField } from "./agent-credential-labels-field";
import { AgentCredentialDescriptiveLabels } from "@/components/agent-credential-descriptive-labels";
import { AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR } from "@/lib/agent-credential-labels";
import { Button } from "@/components/ui/button";
import { agentDeviceState, agentIdentityState } from "@/lib/agent-device-state";
import { AgentPairingGuidance } from "./agent-pairing-guidance";

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
  descriptiveLabels: string[];
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
const PAIRING_POLL_ERROR =
  "Pairing status could not be checked. Refresh identities to try again.";
const fieldClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const statusClass =
  "inline-flex shrink-0 items-center rounded-full border border-border px-2 py-1 text-xs font-medium text-muted-foreground";
const summaryClass =
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
const date = (v: string) => new Date(v).toLocaleString();
const describePermissions = (scopes: AgentScope[]) =>
  scopes
    .map(
      (scope) =>
        AGENT_SCOPE_DEFINITIONS.find((s) => s.scope === scope)?.label ?? scope
    )
    .join(" · ");
const pairedDevicesLabel = (identity: Identity, now: number) => {
  const count = identity.devices.filter(
    (d) => agentDeviceState(d, now) === "Paired"
  ).length;
  return `${count} ${count === 1 ? "paired device" : "paired devices"}`;
};
const deviceSummary = (identity: Identity, now: number) => {
  const permissions = `${identity.scopes.length} ${
    identity.scopes.length === 1 ? "permission" : "permissions"
  }`;
  const pending = identity.devices.filter(
    (d) => agentDeviceState(d, now) === "Pending pairing"
  ).length;
  return `${permissions} · ${pairedDevicesLabel(identity, now)} · ${pending} pending`;
};

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
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {AGENT_SCOPE_DEFINITIONS.filter(
          (s) => !allowed || allowed.includes(s.scope)
        ).map((s) => (
          <label
            key={s.scope}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted/60 has-[:checked]:bg-muted/60"
          >
            <input
              className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <span className="min-w-0">
              <span className="font-medium">{s.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
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
  const [descriptiveLabels, setDescriptiveLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [scopes, setScopes] = useState<AgentScope[]>(initialScopes);
  const [done, setDone] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [deviceScopes, setDeviceScopes] = useState<AgentScope[]>([]);
  const [deviceDone, setDeviceDone] = useState(false);
  const [pairing, setPairing] = useState<{ deviceId: string; code: string | null; expiresAt: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appOrigin, setAppOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const selected = identities.find((i) => i.id === selectedId);
  const selectedIdentityState = selected
    ? agentIdentityState(selected, now)
    : null;
  const canLaunch = selectedIdentityState === "Active";
  const pairingDevice = selected?.devices.find(d => d.id === pairing?.deviceId);
  const pairingState = pairingDevice ? agentDeviceState(pairingDevice, now) : "Expired";
  const pendingUntil = Math.max(0, ...(selected?.devices.filter(d => agentDeviceState(d, now) === "Pending pairing").map(d => Date.parse(d.pairingExpiresAt)) ?? []));
  // Edits and refreshes can remove grants while a device draft stays open.
  const effectiveDeviceScopes = deviceScopes.filter((scope) =>
    selected?.scopes.includes(scope)
  );
  const effectiveDeviceDone = deviceDone && !!selected?.canMoveTasksToDone;
  const endpoint = `/api/projects/${projectId}/agent-identities`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: "no-store", signal });
    if (!response.ok)
      throw new Error("Agent identities could not be loaded. Try refreshing.");
    const data = await response.json();
    if (!signal?.aborted) { setIdentities(data.identities); setNow(Date.now()); }
    return data.identities as Identity[];
  }, [endpoint]);
  useEffect(() => {
    setAppOrigin(window.location.origin);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    if (!pendingUntil || pendingUntil <= Date.now()) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      setNow(Date.now());
      if (Date.now() >= pendingUntil || controller.signal.aborted) return;
      try {
        await refresh(controller.signal);
        if (!controller.signal.aborted)
          setError(current => current === PAIRING_POLL_ERROR ? null : current);
      } catch {
        if (!controller.signal.aborted) setError(PAIRING_POLL_ERROR);
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, Math.max(0, Math.min(3000, pendingUntil - Date.now())));
    };
    timer = setTimeout(tick, Math.min(3000, pendingUntil - Date.now()));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pendingUntil, refresh]);
  useEffect(() => {
    if (pairingState !== "Pending pairing") setPairing(value => value?.code ? { ...value, code: null } : value);
  }, [pairingState]);
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
      const latest = await refresh();
      setNow(Date.now());
      if (data.pairingCode) {
        const device = latest.find(i => i.id === command.identityId)?.devices.find(d => d.id === data.deviceId);
        if (device) setPairing({ deviceId: device.id, code: data.pairingCode, expiresAt: device.pairingExpiresAt });
      }
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
    setPairing(null);
    setConfirmDeactivate(false);
    setDeviceName("");
    setDeviceScopes(identity.scopes);
    setDeviceDone(identity.canMoveTasksToDone);
  };
  return (
    <section aria-label="Agent identities" className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="text-xl font-semibold tracking-tight">
            Agent identities
          </h3>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            One agent across devices and coding clients. Every launch has its
            own session.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 flex-1 sm:flex-none"
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
            <RefreshCw className="size-4" aria-hidden />
            Refresh identities
          </Button>
          <Button
            size="sm"
            className="min-h-11 flex-1 sm:flex-none"
            disabled={busy}
            onClick={() => {
              setSelectedId(null);
              setName("");
              setDescriptiveLabels([]);
              setLabelDraft("");
              setLabelError(null);
              setScopes(initialScopes);
              setDone(false);
              setEditing(true);
              setPairing(null);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New identity
          </Button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 px-4 py-3 text-sm text-destructive"
        >
          {error}{" "}
          <button
            type="button"
            className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm leading-relaxed text-muted-foreground">
          Create an identity, choose its permissions, then authorize a device to
          start working.
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {identities.map((identity) => (
          <button
            type="button"
            key={identity.id}
            aria-label={`${identity.name} ${identity.descriptiveLabels.join(" ")} ${deviceSummary(identity, now)}`.trim()}
            aria-pressed={selectedId === identity.id}
            onClick={() => select(identity)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === identity.id ? "bg-muted ring-1 ring-inset ring-border" : ""}`}
          >
            <Bot
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-words font-semibold [overflow-wrap:anywhere]">
                  {identity.name}
                </span>
                <AgentCredentialDescriptiveLabels
                  labels={identity.descriptiveLabels}
                />
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {deviceSummary(identity, now)}
              </span>
            </span>
            <span className={statusClass}>
              {agentIdentityState(identity, now)}
            </span>
            <ChevronRight
              className={`hidden size-4 shrink-0 text-muted-foreground sm:block ${selectedId === identity.id ? "rotate-90" : ""}`}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {editing && (
        <form
          className="space-y-5 border-t pt-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (labelDraft.trim()) {
              setLabelError(AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR);
              labelInputRef.current?.focus();
              return;
            }
            if (
              await mutate({
                operation: selected ? "update" : "create",
                identityId: selectedId,
                name,
                descriptiveLabels,
                scopes,
                canMoveTasksToDone: done,
              })
            )
              setEditing(false);
          }}
        >
          <h4 className="text-lg font-semibold tracking-tight">
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
          <AgentCredentialLabelsField
            id="agent-identity-labels"
            label="Descriptive labels (optional)"
            labels={descriptiveLabels}
            onLabelsChange={setDescriptiveLabels}
            draft={labelDraft}
            onDraftChange={setLabelDraft}
            error={labelError}
            onErrorChange={setLabelError}
            inputRef={labelInputRef}
            disabled={busy}
          />
          <ScopeChoices scopes={scopes} onChange={setScopes} />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t pt-3 text-sm font-medium">
            <input
              className="size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
              type="checkbox"
              checked={done}
              onChange={(e) => setDone(e.target.checked)}
            />
            Allow moving tasks to Done
          </label>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              className="min-h-11"
              type="submit"
              disabled={busy || !scopes.length}
            >
              {busy
                ? "Saving…"
                : selected
                  ? "Save identity"
                  : "Create identity"}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {selected && !editing && (
        <div className="min-w-0 space-y-6 border-t pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-48">
              <h4 className="break-words text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">
                {selected.name}
              </h4>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                Identity: {selected.id}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={busy || !!selected.revokedAt}
              onClick={() => {
                setName(selected.name);
                setDescriptiveLabels(selected.descriptiveLabels);
                setLabelDraft("");
                setLabelError(null);
                setScopes(selected.scopes);
                setDone(selected.canMoveTasksToDone);
                setEditing(true);
              }}
            >
              Edit identity
            </Button>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <dt className="font-medium">Permissions</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">
                {describePermissions(selected.scopes)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Move tasks to Done</dt>
              <dd className="mt-1 text-muted-foreground">
                {selected.canMoveTasksToDone ? "Allowed" : "Not allowed"}
              </dd>
            </div>
          </dl>
          <div>
            <h5 className="mb-1 text-sm font-semibold">Devices and sessions</h5>
            {!selected.devices.length && (
              <p className="py-3 text-sm text-muted-foreground">
                No devices authorized yet.
              </p>
            )}
            <ul className="divide-y divide-border">
              {selected.devices.map((d) => (
                <li key={d.id} className="min-w-0 space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-2 text-sm">
                      <Laptop
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <strong className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
                        {d.name}
                      </strong>
                      <span className={statusClass}>
                        {agentDeviceState(d, now)}
                      </span>
                    </div>
                    {!d.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        aria-label={`Revoke ${d.name}`}
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            operation: "revoke-device",
                            identityId: selected.id,
                            deviceId: d.id,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                  {agentDeviceState(d, now) === "Paired" && canLaunch && <Button size="sm" variant="ghost" onClick={() => setPairing({ deviceId: d.id, code: null, expiresAt: d.pairingExpiresAt })}>Launch instructions for {d.name}</Button>}
                  <p className="text-xs text-muted-foreground">
                    Expires {date(d.expiresAt)} · Done moves{" "}
                    {d.canMoveTasksToDone && selected.canMoveTasksToDone
                      ? "allowed"
                      : "denied"}
                    <br />
                    Effective permissions:{" "}
                    {describePermissions(
                      d.scopes.filter((s) => selected.scopes.includes(s))
                    ) || "None"}
                  </p>
                  <div className="space-y-3 border-l border-border pl-4">
                    {d.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"
                      >
                        <span className="min-w-0 flex-1 basis-48 break-words [overflow-wrap:anywhere]">
                          <span className="font-medium">{s.client}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">
                            {s.endedAt
                              ? "Ended"
                              : new Date(s.expiresAt) <= new Date()
                                ? "Expired"
                                : "Active"}
                          </span>
                          <br />
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            Last active {date(s.lastActiveAt)}
                            <span className="block break-all font-mono">
                              {s.id}
                            </span>
                          </span>
                        </span>
                        {!s.endedAt && new Date(s.expiresAt) > new Date() && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            aria-label={`End session: ${s.client} on ${d.name}, ${s.id}`}
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
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {!selected.revokedAt && (
            <details className="group border-t pt-2">
              <summary className={summaryClass}>
                Authorize a device
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <form
                className="mt-3 space-y-5 pb-2"
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
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input
                      className="size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                      type="checkbox"
                      checked={effectiveDeviceDone}
                      onChange={(e) => setDeviceDone(e.target.checked)}
                    />
                    Allow Done moves from this device
                  </label>
                )}
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={busy || !effectiveDeviceScopes.length}
                >
                  Generate pairing code
                </Button>
              </form>
            </details>
          )}
          {pairing && (
            <AgentPairingGuidance
              key={pairing.deviceId}
              origin={appOrigin}
              projectId={projectId}
              identityId={selected.id}
              code={pairingState === "Pending pairing" ? pairing.code : null}
              expiresAt={pairing.expiresAt}
              state={pairingState}
              identityState={selectedIdentityState ?? "Active"}
              onDismiss={() => setPairing(null)}
            />
          )}
          <details className="group border-t pt-2">
            <summary className={summaryClass}>
              Recent activity
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <ul className="mt-2 divide-y divide-border">
              {selected.auditEvents.map((a) => (
                <li
                  key={a.id}
                  className="break-words py-3 text-xs leading-relaxed [overflow-wrap:anywhere]"
                >
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
            <div className="flex flex-wrap items-center gap-3 border-t pt-5">
              <p className="min-w-0 flex-1 basis-64 text-xs leading-relaxed text-muted-foreground">
                Deactivating ends all access. Assignments, mentions and
                historical contributions remain attached to this identity.
              </p>
              <Button
                variant="outline"
                className="min-h-11 max-w-full whitespace-normal text-destructive hover:text-destructive"
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
                  className="min-h-11"
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
