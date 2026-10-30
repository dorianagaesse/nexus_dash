// @vitest-environment jsdom
import React, { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LiveSaveScheduler } from "@/lib/live-save/scheduler";
import { useLiveSave } from "@/lib/hooks/use-live-save";
import { ConflictReview } from "@/components/live-save/conflict-review";
import type { LiveSaveAdapter, LiveSaveWriteResult } from "@/lib/live-save/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Fields = { title: string };
const base = { title: "Original" };
const fields = ["title"] as const;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test("a clean remote update is adopted without resubmitting the old value", async () => {
  const save = vi.fn(async () => ({ kind: "accepted" as const, revision: 3, representation: base }));
  const apply = vi.fn();
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: base,
    base,
    baseRevision: 1,
    fields,
    enabled: true,
    applyRepresentation: apply,
  });
  scheduler.setBase({ title: "Remote edit" }, 2);
  await vi.advanceTimersByTimeAsync(2_000);
  scheduler.destroy();
  expect(save).not.toHaveBeenCalled();
  expect(apply).toHaveBeenCalledWith({ title: "Remote edit" }, ["title"]);
});

test("construction alone never schedules a write (abandoned mount)", async () => {
  const save = vi.fn(async () => ({ kind: "accepted" as const, revision: 2, representation: base }));
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: { title: "Restored draft" },
    base,
    baseRevision: 1,
    fields,
    enabled: true,
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(save).not.toHaveBeenCalled();
  scheduler.destroy();
});

test("resume starts scheduling for a dirty instance once the lifecycle commits", async () => {
  const edited = { title: "Restored draft" };
  const save = vi.fn(async () => ({ kind: "accepted" as const, revision: 2, representation: edited }));
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: edited,
    base,
    baseRevision: 1,
    fields,
    enabled: true,
  });
  await vi.advanceTimersByTimeAsync(1_999);
  expect(save).not.toHaveBeenCalled();
  scheduler.resume();
  await vi.advanceTimersByTimeAsync(2_000);
  scheduler.destroy();
  expect(save).toHaveBeenCalledTimes(1);
});

test("StrictMode must not leave an abandoned render's scheduler writing", async () => {
  const edited = { title: "Restored draft" };
  const save = vi.fn(async () => ({ kind: "accepted" as const, revision: 2, representation: edited }));
  const adapter: LiveSaveAdapter<Fields> = { save };
  function Surface() {
    useLiveSave({ adapter, value: edited, base, baseRevision: 1, fields, enabled: true, entityKey: "task:1" });
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <StrictMode>
        <Surface />
      </StrictMode>
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  await act(async () => {
    root.unmount();
  });
  expect(save).toHaveBeenCalledTimes(1);
});

test("unmounting before the debounce fires cancels the pending write", async () => {
  const edited = { title: "Unsaved edit" };
  const save = vi.fn(async () => ({ kind: "accepted" as const, revision: 2, representation: edited }));
  const adapter: LiveSaveAdapter<Fields> = { save };
  function Surface() {
    useLiveSave({ adapter, value: edited, base, baseRevision: 1, fields, enabled: true, entityKey: "task:1" });
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<Surface />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  await act(async () => {
    root.unmount();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(save).not.toHaveBeenCalled();
});

test("maximum wait resets after an accepted save with a newer edit in flight", async () => {
  let resolve!: (value: LiveSaveWriteResult<Fields>) => void;
  const first = new Promise<LiveSaveWriteResult<Fields>>((r) => {
    resolve = r;
  });
  const save = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue({ kind: "accepted", revision: 3, representation: { title: "Newer" } });
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: base,
    base,
    baseRevision: 1,
    fields,
    enabled: true,
  });
  for (let second = 0; second < 30; second++) {
    scheduler.setValue({ title: `Typed ${second}` });
    await vi.advanceTimersByTimeAsync(1_000);
  }
  expect(save).toHaveBeenCalledTimes(1);
  scheduler.setValue({ title: "Newer" });
  resolve({ kind: "accepted", revision: 2, representation: { title: "Typed 29" } });
  await vi.advanceTimersByTimeAsync(1);
  scheduler.destroy();
  expect(save).toHaveBeenCalledTimes(1);
});

test("an accepted normalized value is adopted instead of being autosaved repeatedly", async () => {
  const normalized = { title: "Trimmed title" };
  const save = vi
    .fn()
    .mockResolvedValueOnce({ kind: "accepted", revision: 2, representation: normalized })
    .mockImplementation(() => new Promise(() => {}));
  const apply = vi.fn();
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: base,
    base,
    baseRevision: 1,
    fields,
    enabled: true,
    applyRepresentation: apply,
  });
  scheduler.setValue({ title: "  Trimmed title  " });
  await vi.advanceTimersByTimeAsync(2_001);
  scheduler.destroy();
  expect(save).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith(normalized, ["title"]);
});

test("accepted rich-text markup is adopted without resubmitting the draft", async () => {
  type RichFields = { description: string };
  const richBase = { description: "<p>Hello</p>" };
  const richFields = ["description"] as const;
  const normalized = { description: "<p>Hello world</p>" };
  const save = vi
    .fn()
    .mockResolvedValueOnce({ kind: "accepted", revision: 2, representation: normalized })
    .mockImplementation(() => new Promise(() => {}));
  const apply = vi.fn();
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: richBase,
    base: richBase,
    baseRevision: 1,
    fields: richFields,
    enabled: true,
    applyRepresentation: apply,
  });
  scheduler.setValue({ description: "<p>Hello world </p>" });
  await vi.advanceTimersByTimeAsync(2_001);
  scheduler.destroy();
  expect(save).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith(normalized, ["description"]);
});

test("a newer edit typed in flight survives acknowledgement adoption", async () => {
  let resolve!: (value: LiveSaveWriteResult<Fields>) => void;
  const first = new Promise<LiveSaveWriteResult<Fields>>((r) => {
    resolve = r;
  });
  const save = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue({ kind: "accepted", revision: 3, representation: { title: "Second draft" } });
  const apply = vi.fn();
  const scheduler = new LiveSaveScheduler({
    adapter: { save },
    value: base,
    base,
    baseRevision: 1,
    fields,
    enabled: true,
    applyRepresentation: apply,
  });
  scheduler.setValue({ title: "  First draft  " });
  await vi.advanceTimersByTimeAsync(2_001);
  expect(save).toHaveBeenCalledTimes(1);
  scheduler.setValue({ title: "Second draft" });
  resolve({ kind: "accepted", revision: 2, representation: { title: "First draft" } });
  await vi.advanceTimersByTimeAsync(1);
  expect(apply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2_000);
  scheduler.destroy();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].fields).toEqual({ title: "Second draft" });
});

test("conflict values remain internal without comparisons or recovery choices", async () => {
  const prefix = "a".repeat(300);
  const local = { title: `${prefix} local ending` };
  const latest = { title: `${prefix} remote ending` };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <ConflictReview
          conflict={{
            base,
            local,
            latest,
            latestRevision: 2,
            changedLocally: ["title"],
            changedOnServer: ["title"],
            conflictingFields: ["title"],
          }}
          onResolve={() => {}}
        />
      );
    });
    expect(container.innerHTML).toBe("");
    expect(local.title).toContain("local ending");
    expect(latest.title).toContain("remote ending");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
