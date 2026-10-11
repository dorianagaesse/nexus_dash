// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { LiveSaveStatus, liveSaveStatusText } from "@/components/live-save/live-save-status";
import type { LiveSavePhase, LiveSaveSnapshot } from "@/lib/live-save/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Fields = Record<string, unknown>;

function snapshot(phase: LiveSavePhase, extra: Partial<LiveSaveSnapshot<Fields>> = {}): LiveSaveSnapshot<Fields> {
  return {
    phase,
    enabled: true,
    dirtyFields: [],
    invalidMessage: null,
    failureMessage: null,
    retryAt: null,
    conflict: null,
    savedAt: null,
    ...extra,
  };
}

describe("liveSaveStatusText", () => {
  test("maps phases to the contract labels", () => {
    expect(liveSaveStatusText(snapshot("sending"))).toBe("Saving changes");
    expect(liveSaveStatusText(snapshot("saved"))).toBe("Saved");
    expect(liveSaveStatusText(snapshot("offline-paused"))).toBe("Offline - draft safe locally");
    expect(liveSaveStatusText(snapshot("failed"))).toBe("Save failed - draft safe locally");
    expect(liveSaveStatusText(snapshot("conflict"))).toBe("Conflict - review changes");
  });

  test("stays silent while recovery drafts own the local copy", () => {
    expect(liveSaveStatusText(snapshot("dirty"))).toBeNull();
    expect(liveSaveStatusText(snapshot("clean"))).toBeNull();
    expect(liveSaveStatusText(snapshot("disabled"))).toBeNull();
    expect(liveSaveStatusText(snapshot("hidden-paused"))).toBeNull();
  });

  test("paused and blocked phases explain what happened without claiming Saved", () => {
    expect(liveSaveStatusText(snapshot("invalid-paused"))).toBe(
      "Live save paused until this form is valid"
    );
    expect(
      liveSaveStatusText(snapshot("invalid-paused", { invalidMessage: "Title too long" }))
    ).toBe("Live save paused: Title too long");
    expect(liveSaveStatusText(snapshot("auth-paused"))).toContain("your access changed");
    expect(liveSaveStatusText(snapshot("gone-blocked"))).toContain("no longer available");
  });
});

describe("LiveSaveStatus", () => {
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
  });

  test("renders a polite status with the phase attribute and retry note", async () => {
    await act(async () => { root.render(<LiveSaveStatus snapshot={snapshot("sending")} />); });
    let status = container.querySelector("[role=status]")!;
    expect(status.textContent).toBe("Saving changes");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("data-live-save-phase")).toBe("sending");

    await act(async () => {
      root.render(<LiveSaveStatus snapshot={snapshot("failed", { failureMessage: "boom", retryAt: 5_000 })} />);
    });
    status = container.querySelector("[role=status]")!;
    expect(status.textContent).toBe("Save failed - draft safe locally Retrying automatically.");

    await act(async () => {
      root.render(<LiveSaveStatus snapshot={snapshot("failed", { failureMessage: "boom", retryAt: null })} />);
    });
    expect(container.querySelector("[role=status]")?.textContent).toBe(
      "Save failed - draft safe locally"
    );
  });

  test("marks conflict and gone as destructive alerts and hides quiet phases", async () => {
    await act(async () => { root.render(<LiveSaveStatus snapshot={snapshot("conflict")} />); });
    expect(container.querySelector("[role=status]")?.className).toContain("text-destructive");

    await act(async () => { root.render(<LiveSaveStatus snapshot={snapshot("gone-blocked")} />); });
    expect(container.querySelector("[role=status]")?.className).toContain("text-destructive");

    for (const phase of ["dirty", "clean", "disabled", "hidden-paused"] as const) {
      await act(async () => { root.render(<LiveSaveStatus snapshot={snapshot(phase)} />); });
      expect(container.querySelector("[role=status]")).toBeNull();
    }
  });
});
