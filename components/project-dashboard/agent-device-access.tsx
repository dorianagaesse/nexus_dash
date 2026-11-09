"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { agentDeviceState } from "@/lib/agent-device-state";

type Session = { id: string; client: string; createdAt: string; lastActiveAt: string; expiresAt: string; endedAt: string | null };
type Device = { id: string; name: string; scopes: AgentScope[]; canMoveTasksToDone: boolean; authorizedAt: string | null; revokedAt: string | null; expiresAt: string; pairingExpiresAt: string; sessions: Session[] };
export const readablePermissions = (scopes: AgentScope[]) => scopes.map(scope => AGENT_SCOPE_DEFINITIONS.find(item => item.scope === scope)?.label ?? scope).join(", ") || "None";
const timestamp = (value: string) => <time dateTime={value} title={value}>{new Date(value).toLocaleString()}</time>;

export function AgentDeviceAccess({ identity, now, busy, mutate, onLaunch }: {
  identity: { id: string; scopes: AgentScope[]; canMoveTasksToDone: boolean; revokedAt: string | null; expiresAt: string | null; devices: Device[] };
  now: number; busy: boolean; mutate: (command: Record<string, unknown>) => Promise<boolean>; onLaunch: (device: Device) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; message: string; error: boolean } | null>(null);
  const identityActive = !identity.revokedAt && (!identity.expiresAt || Date.parse(identity.expiresAt) > now);
  const sessions = identity.devices.flatMap(device => device.sessions.map(session => ({ device, session })));
  const isActive = ({ device, session }: typeof sessions[number]) => identityActive && agentDeviceState(device, now) === "Paired" && !session.endedAt && Date.parse(session.expiresAt) > now;
  const active = sessions.filter(isActive);
  const historical = sessions.filter(item => !isActive(item));
  async function act(key: string, command: Record<string, unknown>, success: string, failure: string) {
    setPending(key); setFeedback(null);
    const ok = await mutate({ ...command, identityId: identity.id });
    setPending(null);
    setFeedback({ key, message: ok ? success : failure, error: !ok });
    if (ok) setConfirmId(null);
  }
  const result = (key: string) => feedback?.key === key && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-destructive" : "text-muted-foreground"}`}>{feedback.message}</p>;
  return <div className="space-y-5">
    <section aria-label="Active sessions" className="space-y-2">
      <h5 className="text-sm font-medium">Active sessions ({active.length})</h5>
      <p className="text-xs text-muted-foreground">Sessions with current access. Last activity records requests, not a live connection.</p>
      {!active.length && <p className="text-sm text-muted-foreground">No active sessions. Launch a paired device to start working.</p>}
      <ul className="divide-y divide-border">{active.map(({ device, session }) => <li key={session.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm"><p className="break-words font-medium">{session.client} · {device.name}</p><p className="text-xs text-muted-foreground">Last activity {timestamp(session.lastActiveAt)}</p></div>
          <Button size="sm" variant="outline" disabled={busy} aria-label={`End ${session.client} session on ${device.name}, started ${new Date(session.createdAt).toLocaleString()}, ${session.id}`}
            onClick={() => void act(session.id, { operation: "end-session", sessionId: session.id }, `${session.client} session ended. Other sessions keep their access.`, "Session could not be ended. Refresh identities, then try this session again.")}>
            {pending === session.id ? "Ending session…" : "End session"}
          </Button>
        </div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Session details</summary><p>Started {timestamp(session.createdAt)} · Expires {timestamp(session.expiresAt)}</p><p className="break-all">Session ID: {session.id}</p></details>
        {result(session.id)}
      </li>)}</ul>
      {feedback && !feedback.error && !active.some(item => item.session.id === feedback.key) && !identity.devices.some(d => d.id === feedback.key) && result(feedback.key)}
    </section>
    <section aria-label="Device authorizations">
      <h5 className="text-sm font-medium">Device authorizations</h5>
      {!identity.devices.length && <p className="mt-2 text-sm text-muted-foreground">No devices authorized yet.</p>}
      <ul className="divide-y divide-border">{identity.devices.map(device => <li key={device.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words"><strong className="font-medium">{device.name}</strong> · {agentDeviceState(device, now)}</span>
          {!device.revokedAt && <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal" disabled={busy} onClick={() => { setConfirmId(device.id); setFeedback(null); }}>Revoke {device.name}</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Expires {timestamp(device.expiresAt)}<br />Effective permissions: {identityActive && agentDeviceState(device, now) === "Paired" ? readablePermissions(device.scopes.filter(scope => identity.scopes.includes(scope))) : "None (authorization inactive or pending)"}<br />Done moves {identityActive && agentDeviceState(device, now) === "Paired" && device.canMoveTasksToDone && identity.canMoveTasksToDone && device.scopes.includes("task:write") && identity.scopes.includes("task:write") ? "allowed" : "denied"}</p>
        {agentDeviceState(device, now) === "Paired" && identityActive && <Button size="sm" variant="ghost" className="h-auto min-h-9 max-w-full whitespace-normal" onClick={() => onLaunch(device)}>Launch instructions for {device.name}</Button>}
        {confirmId === device.id && !device.revokedAt && <div className="space-y-2">
          <p className="text-sm">Revoking {device.name} ends all its sessions and prevents new launches. Other devices keep access. This device will need a new owner authorization and pairing.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="destructive" className="h-auto min-h-9 max-w-full whitespace-normal" disabled={busy} onClick={() => void act(device.id, { operation: "revoke-device", deviceId: device.id }, `${device.name} revoked. Its sessions no longer have access.`, "Device could not be revoked. Refresh identities and retry the confirmation.")}>{pending === device.id ? "Revoking device…" : `Confirm revoke ${device.name}`}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>Cancel revocation</Button></div>
        </div>}
        {result(device.id)}
      </li>)}</ul>
    </section>
    {!!historical.length && <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Ended and expired sessions ({historical.length})</summary><ul className="mt-3 space-y-3">{historical.map(({ device, session }) => <li key={session.id} className="text-xs"><p className="font-medium">{session.client} · {device.name} · {session.endedAt ? "Ended" : Date.parse(session.expiresAt) <= now ? "Expired" : "Access revoked"}</p><p className="text-muted-foreground">Started {timestamp(session.createdAt)} · Last activity {timestamp(session.lastActiveAt)}<br />{session.endedAt ? <>Ended {timestamp(session.endedAt)}</> : <>Expires {timestamp(session.expiresAt)}</>}</p><details><summary className="cursor-pointer">Technical details</summary><p className="break-all">Session ID: {session.id}</p></details></li>)}</ul></details>}
  </div>;
}
