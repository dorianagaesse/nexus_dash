// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

import { ProjectAgentCredentialList } from "@/components/project-dashboard/project-agent-credential-list";
import type { ProjectAgentCredentialSummary } from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

test("announces only the settled result count while updating visible matches immediately", async () => {
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const credentials: ProjectAgentCredentialSummary[] = ["Release agent", "Observer"].map((label, index) => ({
    id: `credential-${index}`, label, publicId: `nda_${index}`, scopes: ["task:read"], status: "active",
    expiresAt: null, lastUsedAt: null, lastExchangedAt: null, lastRotatedAt: null, revokedAt: null,
    createdAt: "2026-11-05T09:00:00.000Z", updatedAt: "2026-11-05T09:00:00.000Z",
  }));

  try {
    await act(async () => root.render(<ProjectAgentCredentialList
      credentials={credentials}
      mutatingCredentialId={null}
      onRotateCredential={() => {}}
      onRevokeCredential={() => {}}
    />));
    const announcement = container.querySelector('[role="status"]')!;
    expect(announcement.textContent).toBe("");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(announcement.textContent).toBe("Showing 2 of 2 credentials");

    const search = container.querySelector('input[type="search"]')!;
    const fill = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await fill("Release");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(announcement.textContent).toBe("Showing 2 of 2 credentials");
    await act(async () => { vi.advanceTimersByTime(200); });
    await fill("No match");
    expect(container.querySelectorAll("li")).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(399); });
    expect(announcement.textContent).toBe("Showing 2 of 2 credentials");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(announcement.textContent).toBe("Showing 0 of 2 credentials");
  } finally {
    await act(async () => root.unmount());
  }
});
