// @vitest-environment jsdom

import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConflictReview } from "@/components/live-save/conflict-review";
import { liveSaveStatusText } from "@/components/live-save/live-save-status";
import { recoveryDraftKey, useRecoveryDraft, type RecoveryDraftState } from "@/lib/hooks/use-recovery-draft";
import { useLiveSave, type LiveSaveController } from "@/lib/hooks/use-live-save";
import type {
  LiveSaveAdapter,
  LiveSaveConflictChoice,
  LiveSaveOutcome,
  LiveSaveWriteInput,
  LiveSaveWriteResult,
} from "@/lib/live-save/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Fields extends Record<string, unknown> {
  title: string;
  description: string;
}

const FIELDS = ["title", "description"] as const satisfies readonly (keyof Fields & string)[];

interface RecordState {
  key: string;
  value: Fields;
  base: Fields;
  revision: string;
}

function makeRecord(key: string, value: Fields, revision = "r1"): RecordState {
  return { key, value: { ...value }, base: { ...value }, revision };
}

const draftKey = (entityId: string) =>
  recoveryDraftKey({ userId: "user-1", projectId: "project-1", surface: "task-detail", mode: "edit", entityId });

type QueuedResult = LiveSaveWriteResult<Fields> | (() => Promise<LiveSaveWriteResult<Fields>>);

interface Server {
  state: Fields;
  rev: number;
  results: QueuedResult[];
  calls: LiveSaveWriteInput<Fields>[];
}

function createAdapter(server: Server): LiveSaveAdapter<Fields> {
  return {
    save: vi.fn(async (input: LiveSaveWriteInput<Fields>) => {
      server.calls.push(input);
      const next = server.results.shift();
      if (next) return typeof next === "function" ? next() : next;
      server.state = { ...server.state, ...input.fields };
      server.rev += 1;
      return { kind: "accepted" as const, revision: `r${server.rev}`, representation: { ...server.state } };
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

interface Controls {
  type: (partial: Partial<Fields>) => void;
  switchRecord: (record: RecordState) => void;
  resolve: (choices: Record<string, LiveSaveConflictChoice>) => Promise<LiveSaveOutcome<Fields>>;
  live: LiveSaveController<Fields> | null;
  recovery: RecoveryDraftState | null;
}

let controls: Controls | null = null;
let pendingResolve: Promise<LiveSaveOutcome<Fields>> | null = null;

function Surface({
  adapter,
  initial,
  enabled = true,
}: {
  adapter: LiveSaveAdapter<Fields>;
  initial: RecordState;
  enabled?: boolean;
}) {
  const [record, setRecord] = useState<RecordState>(initial);
  const recovery = useRecoveryDraft<Fields>({
    storageKey: draftKey(record.key),
    value: record.value,
    base: record.base,
    restore: (restored) => setRecord((current) => ({ ...current, value: restored })),
    baseRevision: record.revision,
  });
  const live = useLiveSave<Fields>({
    adapter,
    value: record.value,
    base: record.base,
    baseRevision: record.revision,
    fields: FIELDS,
    enabled,
    entityKey: record.key,
    recovery,
    applyRepresentation: (representation, fields) => {
      setRecord((current) => {
        const value = { ...current.value } as Fields;
        for (const field of fields) {
          value[field as keyof Fields] = representation[field as keyof Fields];
        }
        return { ...current, value };
      });
    },
    onAccepted: (info) => {
      if (!info.fullySynced) return;
      setRecord((current) => ({
        ...current,
        base: { ...info.representation },
        revision: String(info.revision),
      }));
    },
  });
  useEffect(() => {
    controls = {
      type: (partial) => {
        setRecord((current) => ({ ...current, value: { ...current.value, ...partial } }));
      },
      switchRecord: (next) => setRecord(next),
      resolve: (choices) => live.resolveConflict(choices),
      live,
      recovery,
    };
  });
  return (
    <div>
      <span data-testid="phase">{live.snapshot.phase}</span>
      <span data-testid="dirty">{live.snapshot.dirtyFields.join(",")}</span>
      <span data-testid="value">{`${record.value.title}|${record.value.description}`}</span>
      <span data-testid="recovery-conflict">{String(recovery.conflict)}</span>
      {live.snapshot.conflict ? (
        <ConflictReview<Fields>
          conflict={live.snapshot.conflict}
          onResolve={(choices) => {
            pendingResolve = live.resolveConflict(choices);
          }}
        />
      ) : null}
    </div>
  );
}

function harness() {
  return controls!;
}

describe("useLiveSave integrated with recovery drafts", () => {
  let container: HTMLDivElement;
  let root: Root;
  let server: Server;
  let adapter: LiveSaveAdapter<Fields>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    server = {
      state: { title: "Original", description: "Base description" },
      rev: 1,
      results: [],
      calls: [],
    };
    adapter = createAdapter(server);
    controls = null;
    pendingResolve = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  const mount = async (record: RecordState, enabled = true) => {
    await act(async () => {
      root.render(<Surface adapter={adapter} initial={record} enabled={enabled} />);
    });
    await act(async () => { vi.advanceTimersByTime(1); });
  };

  test("debounces a quiet edit into one dirty-field write and clears the local draft on acknowledgement", async () => {
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));
    await act(async () => { harness().type({ title: "Edited" }); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(JSON.parse(localStorage.getItem(draftKey("task-1"))!).payload).toEqual({
      title: "Edited",
      description: "Base description",
    });
    expect(server.calls).toHaveLength(0);

    await act(async () => { vi.advanceTimersByTime(1700); });

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].fields).toEqual({ title: "Edited" });
    expect(server.calls[0].baseRevision).toBe("r1");
    expect(server.calls[0].intent).toBe("autosave");
    expect(harness().live!.snapshot.phase).toBe("saved");
    expect(harness().live!.snapshot.dirtyFields).toEqual([]);
    expect(liveSaveStatusText(harness().live!.snapshot)).toBe("Saved");
    expect(server.calls[0].signal.aborted).toBe(false);
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
    expect(harness().recovery!.conflict).toBe(false);
    expect(container.querySelector("[data-testid=phase]")!.textContent).toBe("saved");
    expect(container.querySelector("[data-testid=value]")!.textContent).toBe("Edited|Base description");
  });

  test("keeps the draft and avoids a false recovery conflict when edits continue during a write", async () => {
    const firstWrite = deferred<LiveSaveWriteResult<Fields>>();
    server.results.push(() => firstWrite.promise);
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));

    await act(async () => { harness().type({ title: "First edit" }); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(server.calls).toHaveLength(1);
    expect(harness().live!.snapshot.phase).toBe("sending");

    await act(async () => { harness().type({ description: "Second edit" }); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(server.calls).toHaveLength(1);

    await act(async () => {
      server.state = { title: "First edit", description: "Base description" };
      server.rev = 2;
      firstWrite.resolve({
        kind: "accepted",
        revision: "r2",
        representation: { ...server.state },
      });
    });

    // The surface base must not advance while newer edits continue, so the
    // recovery hook never flags a false local conflict and the draft stays.
    expect(harness().recovery!.conflict).toBe(false);
    expect(harness().live!.snapshot.phase).toBe("dirty");
    expect(harness().live!.snapshot.dirtyFields).toEqual(["description"]);
    expect(JSON.parse(localStorage.getItem(draftKey("task-1"))!).payload).toEqual({
      title: "First edit",
      description: "Second edit",
    });

    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].fields).toEqual({ description: "Second edit" });
    expect(server.calls[1].baseRevision).toBe("r2");
    expect(harness().live!.snapshot.phase).toBe("saved");
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
    expect(harness().recovery!.conflict).toBe(false);
  });

  test("live-saves a restored recovery draft like typed input and clears it once acknowledged", async () => {
    localStorage.setItem(draftKey("task-1"), JSON.stringify({
      version: 1,
      payload: { title: "Restored title", description: "Base description" },
      base: JSON.stringify({ title: "Original", description: "Base description" }),
      baseRevision: "r1",
      updatedAt: 0,
      writer: "other-writer",
      revision: 1,
    }));
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));

    expect(container.querySelector("[data-testid=value]")!.textContent).toBe("Restored title|Base description");
    expect(harness().live!.snapshot.phase).toBe("dirty");

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].fields).toEqual({ title: "Restored title" });
    expect(server.calls[0].baseRevision).toBe("r1");
    expect(harness().live!.snapshot.phase).toBe("saved");
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
    expect(harness().recovery!.conflict).toBe(false);
  });

  test("stays inert while Live is off, keeps the local draft, and catches up on enable", async () => {
    const record = makeRecord("task-1", { title: "Original", description: "Base description" });
    await mount(record, false);
    await act(async () => { harness().type({ title: "Local only" }); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(JSON.parse(localStorage.getItem(draftKey("task-1"))!).payload.title).toBe("Local only");

    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(server.calls).toHaveLength(0);
    expect(harness().live!.snapshot.phase).toBe("disabled");
    expect(liveSaveStatusText(harness().live!.snapshot)).toBeNull();

    await act(async () => {
      root.render(<Surface adapter={adapter} initial={record} enabled controls={controls} />);
    });
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].fields).toEqual({ title: "Local only" });
    expect(server.calls[0].baseRevision).toBe("r1");
    expect(harness().live!.snapshot.phase).toBe("saved");
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
  });

  test("pauses timed saves offline and resumes when connectivity returns", async () => {
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));
    await act(async () => { harness().type({ title: "Offline edit" }); });
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(harness().live!.snapshot.phase).toBe("offline-paused");

    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(server.calls).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(draftKey("task-1"))!).payload.title).toBe("Offline edit");
    expect(liveSaveStatusText(harness().live!.snapshot)).toBe("Offline - draft safe locally");

    await act(async () => { window.dispatchEvent(new Event("online")); });
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(server.calls).toHaveLength(1);
    expect(harness().live!.snapshot.phase).toBe("saved");
  });

  test("pauses timed saves while the document is hidden and resumes on visibility", async () => {
    const hiddenSpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));
    await act(async () => { harness().type({ title: "Hidden edit" }); });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(harness().live!.snapshot.phase).toBe("hidden-paused");

    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(server.calls).toHaveLength(0);

    hiddenSpy.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(server.calls).toHaveLength(1);
    expect(harness().live!.snapshot.phase).toBe("saved");
    hiddenSpy.mockRestore();
  });

  test("opens conflict review on a guarded rejection and resubmits the local choice against the latest revision", async () => {
    server.state = { title: "Theirs", description: "Their description" };
    server.rev = 9;
    server.results.push({
      kind: "conflict",
      latest: { revision: "r9", representation: { title: "Theirs", description: "Their description" } },
    });
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));

    await act(async () => { harness().type({ title: "Mine" }); });
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(harness().live!.snapshot.phase).toBe("conflict");
    expect(server.calls).toHaveLength(1);
    const review = container.querySelector("[data-conflict-review]")!;
    expect(review.textContent).toContain("Nothing was overwritten; both versions are kept below.");
    expect(review.textContent).toContain("Mine");
    expect(review.textContent).toContain("Theirs");

    const apply = Array.from(review.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply and save"
    ) as HTMLButtonElement;
    await act(async () => { apply.click(); });
    await act(async () => { await pendingResolve; });

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].intent).toBe("explicit");
    expect(server.calls[1].baseRevision).toBe("r9");
    expect(server.calls[1].fields).toEqual({ title: "Mine" });
    expect(container.querySelector("[data-testid=value]")!.textContent).toBe("Mine|Their description");
    expect(harness().live!.snapshot.phase).toBe("saved");
    expect(harness().recovery!.conflict).toBe(false);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
  });

  test("adopts the latest version without a write when every conflict resolves to latest", async () => {
    server.state = { title: "Theirs", description: "Their description" };
    server.rev = 9;
    server.results.push({
      kind: "conflict",
      latest: { revision: "r9", representation: { title: "Theirs", description: "Their description" } },
    });
    await mount(makeRecord("task-1", { title: "Original", description: "Base description" }));
    await act(async () => { harness().type({ title: "Mine" }); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(harness().live!.snapshot.phase).toBe("conflict");

    const review = container.querySelector("[data-conflict-review]")!;
    const latestAll = Array.from(review.querySelectorAll("button")).find(
      (button) => button.textContent === "Use latest for all conflicts"
    ) as HTMLButtonElement;
    await act(async () => { latestAll.click(); });
    await act(async () => { await pendingResolve; });

    expect(server.calls).toHaveLength(1);
    expect(container.querySelector("[data-testid=value]")!.textContent).toBe("Theirs|Their description");
    expect(harness().live!.snapshot.phase).toBe("clean");
    expect(harness().recovery!.conflict).toBe(false);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(localStorage.getItem(draftKey("task-1"))).toBeNull();
  });

  test("aborts the in-flight write on entity switch, drops the late ack, and saves the next record independently", async () => {
    const firstWrite = deferred<LiveSaveWriteResult<Fields>>();
    server.results.push(() => firstWrite.promise);
    await mount(makeRecord("task-1", { title: "A title", description: "A base" }));
    await act(async () => { harness().type({ title: "A edit" }); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(server.calls).toHaveLength(1);
    expect(harness().live!.snapshot.phase).toBe("sending");

    await act(async () => {
      server.state = { title: "B title", description: "B base" };
      harness().switchRecord(makeRecord("task-2", { title: "B title", description: "B base" }));
    });
    await act(async () => { vi.advanceTimersByTime(1); });

    expect(server.calls[0].signal.aborted).toBe(true);
    expect(harness().live!.snapshot.phase).toBe("clean");
    expect(JSON.parse(localStorage.getItem(draftKey("task-1"))!).payload.title).toBe("A edit");

    await act(async () => {
      firstWrite.resolve({
        kind: "accepted",
        revision: "r2",
        representation: { title: "A edit", description: "A base" },
      });
    });
    expect(harness().live!.snapshot.phase).toBe("clean");
    expect(server.calls).toHaveLength(1);

    await act(async () => { harness().type({ title: "B edit" }); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].fields).toEqual({ title: "B edit" });
    expect(server.calls[1].baseRevision).toBe("r1");
    expect(harness().live!.snapshot.phase).toBe("saved");
  });
});
