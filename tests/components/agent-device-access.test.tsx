// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { AgentDeviceAccess } from "@/components/project-dashboard/agent-device-access";
import type { AgentScope } from "@/lib/agent-access";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("active sessions precede history, actions identify each session, and revocation requires explicit confirmation", async () => {
  const now = Date.now();
  const date = (delta: number) => new Date(now + delta).toISOString();
  const session = (id: string, endedAt: string | null = null) => ({ id, client: "Codex", createdAt: date(-10000), lastActiveAt: date(-1000), expiresAt: date(10000), endedAt });
  const identity = { id: "oscar", scopes: ["task:read", "task:write"] as AgentScope[], canMoveTasksToDone: true, revokedAt: null, expiresAt: null,
    devices: [{ id: "laptop", name: "Laptop", scopes: ["task:read"] as AgentScope[], canMoveTasksToDone: true,
      authorizedAt: date(-10000), revokedAt: null, expiresAt: date(100000), pairingExpiresAt: date(-1000), sessions: [session("ended", date(-1000)), session("one"), session("two")] }] };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const mutate = vi.fn().mockResolvedValue(false);
  const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(<AgentDeviceAccess identity={identity} now={now} busy={false} mutate={mutate} onLaunch={() => {}} />));
    expect(container.textContent).toContain("Active sessions (2)");
    expect(container.textContent).toContain("Effective permissions: Task Read");
    expect(container.textContent).toContain("Done moves denied");
    const actions = [...container.querySelectorAll('button[aria-label^="End Codex"]')];
    expect(actions).toHaveLength(2);
    expect(actions[0].getAttribute("aria-label")).not.toBe(actions[1].getAttribute("aria-label"));
    const history = [...container.querySelectorAll("details")].find(d => d.textContent?.includes("Ended and expired sessions"))!;
    expect(history.open).toBe(false);
    await act(async () => button("Revoke Laptop").click());
    expect(mutate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ends all its sessions and prevents new launches");
    await act(async () => button("Confirm revoke Laptop").click());
    expect(mutate).toHaveBeenCalledWith({ operation: "revoke-device", identityId: "oscar", deviceId: "laptop" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Refresh identities and retry");
    mutate.mockResolvedValue(true);
    await act(async () => button("Confirm revoke Laptop").click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Laptop revoked");
  } finally { act(() => root.unmount()); container.remove(); }
});
