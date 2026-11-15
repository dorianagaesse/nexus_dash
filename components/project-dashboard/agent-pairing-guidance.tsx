"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AgentDeviceState,
  AgentIdentityState,
} from "@/lib/agent-device-state";

export function AgentPairingGuidance({ origin, projectId, identityId, code, expiresAt, state, identityState, onDismiss }: {
  origin: string; projectId: string; identityId: string; code: string | null;
  expiresAt: string; state: AgentDeviceState; identityState: AgentIdentityState;
  onDismiss: () => void;
}) {
  const [message, setMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const identityUsable = identityState === "Active";
  const identityLabel = identityState.toLowerCase();
  const binding = `--base ${origin} --project ${projectId} --identity ${identityId}`;
  const login = `node scripts/nd-agent.mjs login ${binding}`;
  const launch = `node scripts/nd-agent.mjs run ${binding}`;
  async function copy(value: string, label: string) {
    setCopyError("");
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`); }
    catch { setCopyError("Copy failed. Select the text and copy it from your browser."); }
  }
  return <section role="region" aria-label="Device pairing instructions" className="space-y-3 border-t pt-4 text-sm">
    <p role="status" className="font-medium">
      {state === "Paired"
        ? identityUsable
          ? "Device paired. Ready to launch."
          : `Device paired. Identity ${identityLabel}, so launch is unavailable.`
        : state === "Pending pairing" ? "Waiting for pairing" : state === "Revoked" ? "Device authorization revoked" : "Pairing expired"}
    </p>
    {state === "Pending pairing" && code && <>
      <p>In your own terminal, open a NexusDash repository checkout containing <code>scripts/nd-agent.mjs</code>. Install Node.js and use an unlocked OS credential vault.</p>
      <p>Run this command, then paste the one-time code at its prompt. Keep the code and vault access out of agent conversations.</p>
      <pre className="whitespace-pre-wrap break-all text-xs">{login}</pre>
      <Button size="sm" variant="outline" onClick={() => void copy(login, "Pairing command")}>Copy pairing command</Button>
      <code className="block select-all break-all" data-pairing-code>{code}</code>
      <Button size="sm" variant="outline" onClick={() => void copy(code, "Pairing code")}>Copy pairing code</Button>
      <p className="text-xs text-muted-foreground">Use once before <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleString()}</time>. This view checks for completion while pairing is pending.</p>
    </>}
    {state === "Paired" && (identityUsable ? <>
      <p>The pairing code has been consumed. Authorization does not mean an agent is currently running.</p>
      <p>From the same repository checkout on this device, launch a bound shell. Each launch creates its own session for this identity.</p>
      <p className="font-medium">Windows PowerShell</p>
      <pre className="whitespace-pre-wrap break-all text-xs">{launch} -- powershell.exe -NoProfile</pre>
      <Button size="sm" variant="outline" onClick={() => void copy(`${launch} -- powershell.exe -NoProfile`, "Windows launch command")}>Copy Windows launch command</Button>
      <p className="font-medium">macOS / Linux</p>
      <pre className="whitespace-pre-wrap break-all text-xs">{launch} -- bash</pre>
      <Button size="sm" variant="outline" onClick={() => void copy(`${launch} -- bash`, "macOS / Linux launch command")}>Copy macOS / Linux launch command</Button>
      <p>Inside that shell, use <code className="break-all">node scripts/nd-agent.mjs request GET /api/projects/{projectId}/tasks</code> to check access. The helper keeps renewable credentials in its parent process.</p>
    </> : <p>Runtime start is rejected while this identity is {identityLabel}. Create or select an active identity, then authorize a device to launch an agent.</p>)}
    {(state === "Expired" || state === "Revoked") && <p>Authorize a new device to generate a fresh code. Existing codes cannot be reused.</p>}
    <p role="status" className="text-xs text-muted-foreground">{message}</p>
    {copyError && <p role="alert" className="text-destructive">{copyError}</p>}
    <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss pairing guidance</Button>
  </section>;
}
