// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AgentCliAuthorizeCard } from "@/components/agent-cli-authorize-card";
import type { CliPairingInspectionView } from "@/lib/services/agent-cli-pairing-service";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentCliAuthorizeCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function readyFixture(): CliPairingInspectionView {
    return {
      state: "ready",
      userCode: "ABCD-2345",
      request: {
        id: "req-1",
        requestedDeviceName: "MacBook Air (nd)",
        requestedProjectId: "proj-1",
        requestedIdentityId: "oscar",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
      approvedGrant: null,
      ownedProjects: [
        {
          id: "proj-1",
          name: "NexusDash Core",
          identities: [
            {
              id: "oscar",
              name: "Oscar",
              descriptiveLabels: ["Orchestrator"],
              identityMode: true,
              scopes: ["project:read", "task:read", "task:write"],
              canMoveTasksToDone: true,
              pairedDeviceCount: 1,
            },
            {
              id: "nova",
              name: "Nova",
              descriptiveLabels: ["Reviewer"],
              identityMode: true,
              scopes: ["task:read"],
              canMoveTasksToDone: false,
              pairedDeviceCount: 0,
            },
          ],
        },
      ],
    };
  }

  test("shows selected identity and grant, narrows permissions on identity switch, and displays approved summary", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        return Response.json({
          decision: "approved",
          projectId: "proj-1",
          projectName: "NexusDash Core",
          identityId: body.identityId,
          identityName: body.identityId === "nova" ? "Nova" : "Oscar",
          descriptiveLabels:
            body.identityId === "nova" ? ["Reviewer"] : ["Orchestrator"],
          deviceId: "dev-99",
          deviceName: body.deviceName,
          scopes: body.scopes,
          canMoveTasksToDone: body.canMoveTasksToDone,
          deviceExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      })
    );

    await act(async () => {
      root.render(<AgentCliAuthorizeCard initialView={readyFixture()} />);
    });

    expect(
      container.querySelector("[data-cli-user-code]")?.textContent
    ).toBe("ABCD-2345");
    expect(container.textContent).toContain("Oscar (oscar)");
    expect(container.textContent).toContain("Orchestrator");
    expect(container.textContent).toContain("Move to Done allowed");

    // Select Nova and verify Done option disappears and grant updates to Tasks read.
    const novaRadio = container.querySelector<HTMLInputElement>(
      'input[type="radio"][value="nova"]'
    )!;
    await act(async () => novaRadio.click());
    expect(container.textContent).toContain("Nova (nova)");
    expect(container.textContent).not.toContain(
      "Allow moving tasks to Done from this installation"
    );

    // Switch back to Oscar and approve.
    const oscarRadio = container.querySelector<HTMLInputElement>(
      'input[type="radio"][value="oscar"]'
    )!;
    await act(async () => oscarRadio.click());

    const approveBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Approve Oscar for this CLI")
    )!;
    await act(async () => approveBtn.click());

    expect(requests).toEqual([
      {
        code: "ABCD-2345",
        decision: "approve",
        projectId: "proj-1",
        identityId: "oscar",
        deviceName: "MacBook Air (nd)",
        scopes: ["project:read", "task:read", "task:write"],
        canMoveTasksToDone: true,
      },
    ]);
    expect(container.textContent).toContain("CLI installation approved");
    expect(container.textContent).toContain("NexusDash Core");
    expect(container.textContent).toContain("Oscar");
    expect(container.textContent).toContain("Identity ID: oscar");
    expect(container.textContent).toContain("Installation ID: dev-99");
  });

  test("handles code entry and request decline cleanly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") {
          expect(url).toContain("code=ABCD-2345");
          return Response.json(readyFixture());
        }
        return Response.json({ decision: "denied" });
      })
    );

    await act(async () => {
      root.render(
        <AgentCliAuthorizeCard
          initialView={{
            state: "code-required",
            userCode: null,
            request: null,
            approvedGrant: null,
            ownedProjects: [],
          }}
        />
      );
    });

    const codeInput = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(codeInput, "ABCD-2345");
      codeInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const continueBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Continue")
    )!;
    await act(async () => continueBtn.click());
    expect(container.textContent).toContain("Oscar");

    const declineBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Decline request")
    )!;
    await act(async () => declineBtn.click());
    expect(container.textContent).toContain("CLI pairing declined");
  });
});
