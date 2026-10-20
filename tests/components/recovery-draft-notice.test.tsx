// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RecoveryDraftNotice } from "@/components/recovery-draft-notice";
import type { RecoveryDraftState } from "@/lib/hooks/use-recovery-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draftState(overrides: Partial<RecoveryDraftState> = {}): RecoveryDraftState {
  return {
    restored: false,
    locallyStored: false,
    conflict: false,
    error: null,
    incompatibleDraft: null,
    discard: vi.fn(),
    acceptConflict: vi.fn(),
    saved: vi.fn(),
    flush: vi.fn(),
    ...overrides,
  };
}

describe("RecoveryDraftNotice", () => {
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

  function render(draft: RecoveryDraftState, onDiscard = vi.fn()) {
    act(() => {
      root.render(<RecoveryDraftNotice draft={draft} onDiscard={onDiscard} />);
    });
  }

  test("renders nothing while a routine local draft is stored or updated", () => {
    render(draftState({ locallyStored: true }));
    expect(container.textContent).toBe("");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("renders the restored state with a discard action and no storage narration", () => {
    render(draftState({ restored: true, locallyStored: true }));
    expect(container.textContent).toContain("Draft restored.");
    expect(container.textContent).not.toContain("browser");
    expect(container.textContent).not.toContain("saved locally");
    const discard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Discard draft")
    );
    expect(discard).toBeDefined();
  });

  test("renders the conflict state with review and discard actions", () => {
    render(draftState({ conflict: true }));
    expect(container.textContent).toContain("Another version of this draft or saved record exists.");
    expect(container.textContent).toContain("I reviewed; keep my changes");
    expect(container.textContent).toContain("Discard draft");
  });

  test("renders a storage failure without a routine saved indicator", () => {
    render(draftState({ error: "This draft could not be stored in this browser. Copy your changes before leaving." }));
    expect(container.textContent).toContain("could not be stored");
    expect(container.textContent).not.toContain("saved locally");
  });

  test("renders an incompatible draft for copying with its discard action", () => {
    render(draftState({
      error: "This browser has a draft from another version. Copy it before discarding it.",
      incompatibleDraft: "{\"legacy\":true}",
    }));
    expect(container.querySelector("textarea")?.value).toBe("{\"legacy\":true}");
    expect(container.textContent).toContain("Discard draft");
  });

  test("discarding a restored draft calls onDiscard after confirmation", () => {
    const onDiscard = vi.fn();
    render(draftState({ restored: true }), onDiscard);
    const discard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Discard draft")
    );
    act(() => discard?.click());
    const confirm = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Confirm discard")
    );
    act(() => confirm?.click());
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
