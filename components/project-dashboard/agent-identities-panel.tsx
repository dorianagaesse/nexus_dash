"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { AGENT_CREDENTIAL_PRESETS, AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { AgentCredentialLabelsField } from "./agent-credential-labels-field";
import { AgentCredentialDescriptiveLabels } from "@/components/agent-credential-descriptive-labels";
import { AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR } from "@/lib/agent-credential-labels";
import { ProjectAgentPermissionFields } from "./project-agent-permission-fields";
import { AgentDeviceAccess } from "./agent-device-access";
import { Button } from "@/components/ui/button";
import { agentDeviceState } from "@/lib/agent-device-state";
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
    .join(" Â· ");

function ScopeChoices({
  scopes,
  onChange,
  allowed,
}: {
  scopes: AgentScope[];
  onChange: (v: AgentScope[]) => void;
  allowed?: AgentScope[];
}) {
  return <fieldset className="min-w-0 space-y-3">
    <legend className="mb-2 text-sm font-medium">Permissions</legend>
    <label className="block space-y-1 text-sm">Task permission preset
      <select className={fieldClass} value="custom" onChange={event => {
        const preset = AGENT_CREDENTIAL_PRESETS.find(item => item.id === event.target.value);
        if (preset) onChange(preset.scopes.filter(scope => !allowed || allowed.includes(scope)));
      }}>
        <option value="custom">Custom permissions</option>
        {AGENT_CREDENTIAL_PRESETS.filter(preset => !allowed || preset.scopes.some(scope => allowed.includes(scope))).map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">Presets replace the selection with task permissions. Choose other modules below. Device grants stay within this identity?s permissions.</p>
    <ProjectAgentPermissionFields value={scopes} onChange={onChange} allowed={allowed} />
    <details className="text-sm"><summary className="cursor-pointer">Reserved capabilities</summary>
      <p className="my-2 text-xs text-muted-foreground">Shared schedule grants are reserved for future use. They do not grant personal Calendar access.</p>
      {AGENT_SCOPE_DEFINITIONS.filter(item => item.scope.startsWith("schedule:") && (!allowed || allowed.includes(item.scope))).map(item => <label key={item.scope} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={scopes.includes(item.scope)} onChange={event => onChange(event.target.checked ? [...scopes, item.scope] : scopes.filter(scope => scope !== item.scope))} />{item.label}</label>)}
    </details>
  </fieldset>;
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
      try { await refresh(controller.signal); }
      catch { if (!controller.signal.aborted) setError("Pairing status could not be checked. Refresh identities to try again."); }
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
          Loading identitiesâ€¦
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
            aria-label={`${identity.name} ${identity.descriptiveLabels.join(" ")}`.trim()}
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
                {identity.scopes.length}{" "}
                {identity.scopes.length === 1 ? "permission" : "permissions"} Â·{" "}
                {
                  identity.devices.filter(
                    (d) => agentDeviceState(d, now) === "Paired"
                  ).length
                }{" "}
                paired devices Â· {identity.devices.filter(d => agentDeviceState(d, now) === "Pending pairing").length} pending
              </span>
            </span>
            <span className={statusClass}>
              {identity.revokedAt
                ? "Inactive"
                : identity.expiresAt &&
                    new Date(identity.expiresAt) <= new Date()
                  ? "Expired"
                  : "Active"}
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
          <p className="text-xs text-muted-foreground">Done moves also require Tasks edit (Task Write). This option alone does not grant task editing.</p>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              className="min-h-11"
              type="submit"
              disabled={busy || !scopes.length}
            >
              {busy
                ? "Savingâ€¦"
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
              <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Identity details</summary><p className="break-all">Identity ID: {selected.id}</p><p>{selected.identityMode ? "Runtime identity" : "Legacy credential and paired devices share this actor?s attribution."}</p></details>
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
                {selected.canMoveTasksToDone && selected.scopes.includes("task:write") ? "Allowed" : "Not allowed"}
              </dd>
            </div>
          </dl>
          <AgentDeviceAccess key={selected.id} identity={selected} now={now} busy={busy} mutate={mutate}
            onLaunch={device => setPairing({ deviceId: device.id, code: null, expiresAt: device.pairingExpiresAt })} />
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
                  Its permissions cannot exceed this identityâ€™s permissions.
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
                    Allow Done moves from this device (requires Tasks edit)
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
                    {a.metadata?.client ? ` Â· ${a.metadata.client}` : ""}
                    {a.metadata?.deviceName
                      ? ` Â· ${a.metadata.deviceName}`
                      : ""}
                    {a.metadata?.path ? ` Â· ${a.metadata.path}` : ""}
                  </span>
                  <span className="block text-muted-foreground">
                    {date(a.createdAt)}
                    {a.metadata?.sessionId
                      ? ` Â· Session ${a.metadata.sessionId}`
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
