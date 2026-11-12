// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AgentIdentitiesPanel } from "@/components/project-dashboard/agent-identities-panel";
import type { AgentScope } from "@/lib/agent-access";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentIdentitiesPanel device grants", () => {
  let container: HTMLDivElement;
  let root: Root;
  let identity: {
    id: string;
    name: string;
    descriptiveLabels: string[];
    identityMode: boolean;
    revokedAt: string | null;
    expiresAt: string | null;
    scopes: AgentScope[];
    canMoveTasksToDone: boolean;
    devices: { id: string; name: string; scopes: AgentScope[]; canMoveTasksToDone: boolean; authorizedAt: string | null; revokedAt: string | null; expiresAt: string; pairingExpiresAt: string; sessions: [] }[];
    auditEvents: [];
  };
  let commands: Record<string, unknown>[];

  function button(text: string) {
    const result = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === text
    );
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
  }

  function input(label: string, parent: ParentNode = container) {
    const result = Array.from(parent.querySelectorAll("label"))
      .find((element) => element.textContent?.trim().startsWith(label))
      ?.querySelector("input");
    if (!result) throw new Error(`Missing input: ${label}`);
    return result;
  }

  async function click(element: HTMLElement) {
    await act(async () => element.click());
  }

  async function authorize() {
    const name = input("Device name");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(name, "Work laptop");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Generate pairing code"));
  }

  beforeEach(async () => {
    identity = {
      id: "oscar",
      name: "Oscar",
      descriptiveLabels: ["Orchestrator"],
      identityMode: true,
      revokedAt: null,
      expiresAt: null,
      scopes: ["task:read", "task:write"],
      canMoveTasksToDone: true,
      devices: [],
      auditEvents: [],
    };
    commands = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== "POST") {
          return Response.json({ identities: [identity] });
        }
        const command = JSON.parse(String(options.body));
        commands.push(command);
        if (command.operation === "update") {
          identity = {
            ...identity,
            scopes: command.scopes,
            canMoveTasksToDone: command.canMoveTasksToDone,
          };
          // The real update endpoint does not return identityId.
          return Response.json({ updated: true });
        }
        if (command.operation === "authorize-device") {
          identity.devices.push({ id: "device-1", name: command.name, scopes: command.scopes, canMoveTasksToDone: command.canMoveTasksToDone,
            authorizedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), pairingExpiresAt: new Date(Date.now() + 600000).toISOString(), sessions: [] });
          return Response.json({ deviceId: "device-1", pairingCode: "one-time-test-code" });
        }
        throw new Error(`Unexpected operation: ${command.operation}`);
      })
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(<AgentIdentitiesPanel projectId="project-1" />)
    );
    await click(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
      ).find((element) => element.textContent?.includes("Oscar"))!
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("authorizes with only the saved grants after reducing scopes and Done without reselecting", async () => {
    await click(button("Edit identity"));
    await click(input("Task Write"));
    await click(input("Allow moving tasks to Done"));
    await click(button("Save identity"));

    expect(container.textContent).not.toContain(
      "Allow Done moves from this device"
    );
    expect(container.querySelector("details form")?.textContent).not.toContain(
      "Task Write"
    );
    await authorize();

    expect(commands.at(-1)).toEqual({
      operation: "authorize-device",
      identityId: "oscar",
      name: "Work laptop",
      scopes: ["task:read"],
      canMoveTasksToDone: false,
    });
    expect(container.textContent).toContain("one-time-test-code");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test("disables pairing when refresh removes all selected device scopes and preserves narrower choices", async () => {
    // Leave only task:write selected for the new device.
    await click(input("Task Read"));
    await click(input("Allow Done moves from this device"));
    identity = { ...identity, scopes: ["task:read"] };
    await click(button("Refresh identities"));

    expect(button("Generate pairing code").disabled).toBe(true);
    expect(input("Task Read").checked).toBe(false);
    expect(input("Allow Done moves from this device").checked).toBe(false);
    await click(input("Task Read"));
    expect(button("Generate pairing code").disabled).toBe(false);
    await authorize();

    expect(commands.at(-1)).toMatchObject({
      operation: "authorize-device",
      scopes: ["task:read"],
      canMoveTasksToDone: false,
    });
  });

  test("pending pairing refreshes to consumed code and bound launch commands, then stops polling", async () => {
    vi.useFakeTimers();
    await authorize();
    expect(container.textContent).toContain("0 paired devices · 1 pending");
    expect(container.querySelector("[data-pairing-code]")?.textContent).toBe("one-time-test-code");
    identity.devices[0].authorizedAt = new Date().toISOString();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.textContent).toContain("Device paired. Ready to launch.");
    expect(container.textContent).toContain("1 paired device · 0 pending");
    const identityButton = Array.from(
      container.querySelectorAll("button")
    ).find((element) => element.textContent?.includes("Oscar"));
    expect(identityButton?.getAttribute("aria-label")).toContain(
      "Oscar Orchestrator"
    );
    expect(identityButton?.getAttribute("aria-label")).toContain(
      "1 paired device · 0 pending"
    );
    expect(identityButton?.textContent).toContain("1 paired device · 0 pending");
    expect(
      container.querySelector(
        '[role="region"][aria-label="Device pairing instructions"]'
      )
    ).not.toBeNull();
    expect(container.querySelector("[data-pairing-code]")).toBeNull();
    expect(container.textContent).toContain("--project project-1 --identity oscar -- powershell.exe -NoProfile");
    const calls = vi.mocked(fetch).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
  });

  test("expired codes are hidden and polling ends at the pairing deadline", async () => {
    vi.useFakeTimers();
    await authorize();
    await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
    expect(container.querySelector("[data-pairing-code]")).toBeNull();
    expect(container.textContent).toContain("Pairing expired");
    const calls = vi.mocked(fetch).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
  });

  test("clears a transient pairing polling error when polling recovers", async () => {
    vi.useFakeTimers();
    await authorize();
    vi.mocked(fetch).mockImplementationOnce(
      async () => new Response(null, { status: 500 })
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Pairing status could not be checked."
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test("withdraws launch guidance when the identity is inactive or expired", async () => {
    vi.useFakeTimers();
    await authorize();
    identity.devices[0].authorizedAt = new Date().toISOString();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.textContent).toContain("Device paired. Ready to launch.");

    identity.revokedAt = new Date().toISOString();
    await click(button("Refresh identities"));
    expect(container.textContent).toContain(
      "Device paired. Identity inactive, so launch is unavailable."
    );
    expect(container.textContent).toContain(
      "Runtime start is rejected while this identity is inactive."
    );
    expect(container.textContent).not.toContain("Copy Windows launch command");
    expect(container.textContent).not.toContain(
      "Launch instructions for Work laptop"
    );

    identity.revokedAt = null;
    identity.expiresAt = new Date(Date.now() - 1000).toISOString();
    await click(button("Refresh identities"));
    expect(container.textContent).toContain(
      "Device paired. Identity expired, so launch is unavailable."
    );
    expect(container.textContent).not.toContain("Copy Windows launch command");
  });
});
