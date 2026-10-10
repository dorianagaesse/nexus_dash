// @vitest-environment jsdom

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clearUserRecoveryDrafts, recoveryDraftKey, useRecoveryDraft } from "@/lib/hooks/use-recovery-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = recoveryDraftKey({ userId: "user-1", projectId: "project-1", surface: "task-comment", mode: "create", entityId: "task-1" });

function Harness({ base = "", onSubmit, acknowledgedValue }: { base?: string; onSubmit?: (value: string) => void; acknowledgedValue?: string }) {
  const [value, setValue] = useState(base);
  const draft = useRecoveryDraft({ storageKey: key, value, base, restore: setValue });
  return <div>
    <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
    <span data-testid="draft-state">{draft.conflict ? "conflict" : draft.restored ? "restored" : "clean"}</span>
    <span data-testid="incompatible">{draft.incompatibleDraft ?? "none"}</span>
    <button onClick={() => { onSubmit?.(value); draft.saved(acknowledgedValue ?? value); }}>Submit</button>
    <button onClick={() => { draft.discard(true); setValue(base); }}>Discard</button>
  </div>;
}

describe("useRecoveryDraft", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  const render = async (root: Root, base = "") => {
    await act(async () => { root.render(<Harness base={base} />); });
    await act(async () => { vi.advanceTimersByTime(1); });
  };

  test("persists after the debounce and restores after remount", async () => {
    await render(root);
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Long comment");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(localStorage.getItem(key)).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(JSON.parse(localStorage.getItem(key)!).payload).toBe("Long comment");

    act(() => root.unmount());
    root = createRoot(container);
    await render(root);
    expect(container.querySelector("input")?.value).toBe("Long comment");
    expect(container.querySelector("[data-testid=draft-state]")?.textContent).toBe("restored");
  });

  test("flags a changed server base and keeps the draft until explicit discard", async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, payload: "My changes", base: JSON.stringify("Old"), updatedAt: Date.now(), writer: "other", revision: 1 }));
    await render(root, "Current");
    expect(container.querySelector("input")?.value).toBe("My changes");
    expect(container.querySelector("[data-testid=draft-state]")?.textContent).toBe("conflict");
    await act(async () => { (container.querySelector("button:last-child") as HTMLButtonElement).click(); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(container.querySelector("input")?.value).toBe("Current");
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "New draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(JSON.parse(localStorage.getItem(key)!).payload).toBe("New draft");
  });

  test("does not overwrite another tab's draft and clears only the signed-out user's namespace", async () => {
    await render(root);
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "This tab");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(300); });
    const competing = JSON.stringify({ version: 1, payload: "Other tab", base: JSON.stringify(""), updatedAt: Date.now(), writer: "other", revision: 2 });
    await act(async () => {
      localStorage.setItem(key, competing);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: competing }));
    });
    expect(container.querySelector("[data-testid=draft-state]")?.textContent).toBe("conflict");
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem(key)).toBe(competing);
    const forkKey = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .find((storedKey) => storedKey?.startsWith(`${key}:conflict:`));
    expect(forkKey).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(forkKey!)!).payload).toBe("This tab");

    act(() => root.unmount());
    root = createRoot(container);
    await render(root);
    expect(container.querySelector("input")?.value).toBe("This tab");
    expect(localStorage.getItem(key)).toBe(competing);

    const otherUserKey = recoveryDraftKey({ userId: "user-2", projectId: "project-1", surface: "task-comment", mode: "create", entityId: "task-1" });
    localStorage.setItem(otherUserKey, competing);
    clearUserRecoveryDrafts("user-1");
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(forkKey!)).toBeNull();
    expect(localStorage.getItem(otherUserKey)).toBe(competing);
  });

  test("does not clear edits made after the submitted revision", async () => {
    await act(async () => { root.render(<Harness acknowledgedValue="Earlier text" />); });
    await act(async () => { vi.advanceTimersByTime(1); });
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Newer text");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    expect(JSON.parse(localStorage.getItem(key)!).payload).toBe("Newer text");
  });

  test("clears a submitted create draft after its dialog closes", async () => {
    let acknowledge: (() => void) | null = null;
    function ClosingHarness() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState("");
      const draft = useRecoveryDraft({ storageKey: open ? key : null, value, base: "", restore: setValue });
      return <div>
        <input value={value} onChange={(event) => setValue(event.target.value)} />
        <button onClick={() => { draft.flush(); acknowledge = () => draft.saved(value); setOpen(false); setValue(""); }}>Create</button>
      </div>;
    }
    await act(async () => { root.render(<ClosingHarness />); });
    await act(async () => { vi.advanceTimersByTime(1); });
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Submitted task");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    expect(JSON.parse(localStorage.getItem(key)!).payload).toBe("Submitted task");
    await act(async () => { acknowledge?.(); });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test("keeps an incompatible draft copyable until explicit discard", async () => {
    const raw = JSON.stringify({ version: 2, payload: "Future format" });
    localStorage.setItem(key, raw);
    await render(root);
    expect(container.querySelector("[data-testid=incompatible]")?.textContent).toBe(raw);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem(key)).toBe(raw);
    await act(async () => { (container.querySelector("button:last-child") as HTMLButtonElement).click(); });
    expect(localStorage.getItem(key)).toBeNull();
  });
});
