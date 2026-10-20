import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LiveSaveScheduler, type LiveSaveSchedulerOptions } from "@/lib/live-save/scheduler";
import type {
  LiveSaveAdapter,
  LiveSaveWriteInput,
  LiveSaveWriteResult,
} from "@/lib/live-save/types";

type Fields = { title: string; description: string; labels: string[] };

const BASE: Fields = {
  title: "Task title",
  description: "Old description",
  labels: ["feature"],
};

const OTHER: Fields = { title: "Other", description: "Other", labels: [] };

function accepted(revision: string, representation: Fields): LiveSaveWriteResult<Fields> {
  return { kind: "accepted", revision, representation };
}

function setup(overrides: Partial<LiveSaveSchedulerOptions<Fields>> = {}) {
  const calls: LiveSaveWriteInput<Fields>[] = [];
  const results: Array<LiveSaveWriteResult<Fields> | Promise<LiveSaveWriteResult<Fields>>> = [];
  const adapter: LiveSaveAdapter<Fields> = {
    save: vi.fn(async (input) => {
      calls.push(input);
      const result = results.shift();
      if (!result) throw new Error(`unexpected save call #${calls.length}`);
      return result;
    }),
  };
  const scheduler = new LiveSaveScheduler<Fields>({
    adapter,
    value: { ...BASE },
    base: { ...BASE },
    baseRevision: "r1",
    fields: ["title", "description", "labels"],
    enabled: true,
    ...overrides,
  });
  return { scheduler, calls, results, adapter };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("LiveSaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("stays inert while disabled", async () => {
    const { scheduler, calls } = setup({ enabled: false });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(0);
    expect(scheduler.getSnapshot().phase).toBe("disabled");
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  test("sends only dirty fields 2 seconds after the last change", async () => {
    const { scheduler, calls, results } = setup();
    scheduler.setValue({ ...BASE, title: "New title" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(0);
    expect(scheduler.getSnapshot().phase).toBe("dirty");
    results.push(accepted("r2", { ...BASE, title: "New title" }));
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].fields).toEqual({ title: "New title" });
    expect(calls[0].baseRevision).toBe("r1");
    expect(calls[0].intent).toBe("autosave");
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("treats equal collection values as clean", async () => {
    const { scheduler, calls } = setup();
    scheduler.setValue({ ...BASE, labels: ["feature"] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
  });

  test("caps continuous typing at the 30-second maximum wait", async () => {
    const { scheduler, calls, results } = setup();
    for (let second = 0; second <= 29; second += 1) {
      scheduler.setValue({ ...BASE, title: `T${second}` });
      if (second < 29) await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(calls).toHaveLength(0);
    results.push(accepted("r2", { ...BASE, title: "T29" }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(1);
    expect(calls[0].fields).toEqual({ title: "T29" });
  });

  test("coalesces edits made during an in-flight save into one later request", async () => {
    const { scheduler, calls, results } = setup();
    const first = deferred<LiveSaveWriteResult<Fields>>();
    results.push(first.promise);
    scheduler.setValue({ ...BASE, title: "A" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    scheduler.setValue({ ...BASE, title: "A", description: "D2" });
    await vi.advanceTimersByTimeAsync(500);
    scheduler.setValue({ ...BASE, title: "A", description: "D3" });
    await vi.advanceTimersByTimeAsync(500);
    first.resolve(accepted("r2", { ...BASE, title: "A" }));
    await vi.advanceTimersByTimeAsync(0);
    results.push(accepted("r3", { ...BASE, title: "A", description: "D3" }));
    await vi.advanceTimersByTimeAsync(1_499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].fields).toEqual({ description: "D3" });
    expect(calls[1].baseRevision).toBe("r2");
  });

  test("pauses while the draft is invalid and resumes when it becomes valid", async () => {
    const validate = (value: Fields) =>
      value.title.trim().length >= 2
        ? ({ valid: true } as const)
        : ({ valid: false, message: "Title is too short." } as const);
    const { scheduler, calls, results } = setup({ validate });
    scheduler.setValue({ ...BASE, title: "x" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
    expect(scheduler.getSnapshot().phase).toBe("invalid-paused");
    expect(scheduler.getSnapshot().invalidMessage).toBe("Title is too short.");
    scheduler.setValue({ ...BASE, title: "xy" });
    results.push(accepted("r2", { ...BASE, title: "xy" }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
  });

  test("pauses timed saves while offline and resumes online", async () => {
    const { scheduler, calls, results } = setup();
    scheduler.setOnline(false);
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
    expect(scheduler.getSnapshot().phase).toBe("offline-paused");
    scheduler.setOnline(true);
    results.push(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
  });

  test("pauses timed saves while the tab is hidden and resumes when visible", async () => {
    const { scheduler, calls, results } = setup();
    scheduler.setVisible(false);
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
    expect(scheduler.getSnapshot().phase).toBe("hidden-paused");
    scheduler.setVisible(true);
    results.push(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
  });

  test("retries transient failures at 5, 15, and 60 seconds, capped", async () => {
    const { scheduler, calls, results } = setup();
    const failure = { kind: "failed", message: "boom", retryable: true } as const;
    results.push(failure, failure, failure, failure);
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    expect(scheduler.getSnapshot().phase).toBe("failed");
    expect(scheduler.getSnapshot().retryAt).toBe(7_000);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(scheduler.getSnapshot().retryAt).toBe(22_000);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(calls).toHaveLength(3);
    expect(scheduler.getSnapshot().retryAt).toBe(82_000);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(4);
    expect(scheduler.getSnapshot().retryAt).toBe(142_000);

    results.push(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(5);
    expect(scheduler.getSnapshot().phase).toBe("saved");

    results.push(failure);
    scheduler.setValue({ ...BASE, title: "Newer" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(6);
    expect(scheduler.getSnapshot().retryAt).toBe(144_000 + 5_000);
  });

  test("waits for a new edit or explicit save after a non-retryable failure", async () => {
    const { scheduler, calls, results } = setup();
    results.push({ kind: "failed", message: "Rejected.", retryable: false });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    expect(scheduler.getSnapshot().phase).toBe("failed");
    expect(scheduler.getSnapshot().retryAt).toBeNull();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls).toHaveLength(1);

    results.push(accepted("r2", { ...BASE, title: "Newest" }));
    scheduler.setValue({ ...BASE, title: "Newest" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(2);
  });

  test("explicit save cancels the timer and sends immediately through the guarded path", async () => {
    const { scheduler, calls, results } = setup();
    results.push(accepted("r2", { ...BASE, title: "New" }));
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(500);
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("accepted");
    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe("explicit");
    expect(calls[0].baseRevision).toBe("r1");
    expect(calls[0].fields).toEqual({ title: "New" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("explicit save with no dirty fields is a no-op", async () => {
    const { scheduler, calls } = setup();
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("clean");
    expect(calls).toHaveLength(0);
  });

  test("enters conflict review when both sides changed the same field", async () => {
    const { scheduler, calls, results } = setup();
    results.push({
      kind: "conflict",
      latest: { revision: "r9", representation: { ...BASE, title: "Server title" } },
    });
    scheduler.setValue({ ...BASE, title: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.phase).toBe("conflict");
    expect(snapshot.conflict?.conflictingFields).toEqual(["title"]);
    expect(snapshot.conflict?.changedLocally).toEqual(["title"]);
    expect(snapshot.conflict?.changedOnServer).toEqual(["title"]);
    expect(snapshot.conflict?.local.title).toBe("Mine");
    expect(snapshot.conflict?.latest.title).toBe("Server title");
    expect(snapshot.conflict?.base.title).toBe("Task title");
    expect(snapshot.conflict?.latestRevision).toBe("r9");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
    scheduler.setValue({ ...BASE, title: "Mine 2" });
    expect(scheduler.getSnapshot().phase).toBe("conflict");
    expect(scheduler.getSnapshot().conflict?.local.title).toBe("Mine 2");
  });

  test("rebases disjoint server changes once and retries", async () => {
    const applyRepresentation = vi.fn();
    const { scheduler, calls, results } = setup({ applyRepresentation });
    results.push({
      kind: "conflict",
      latest: {
        revision: "r9",
        representation: { ...BASE, title: "Server title", description: "Old description" },
      },
    });
    results.push(accepted("r10", { ...BASE, title: "Server title", description: "Mine" }));
    scheduler.setValue({ ...BASE, description: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(2);
    expect(calls[0].baseRevision).toBe("r1");
    expect(calls[1].baseRevision).toBe("r9");
    expect(calls[1].fields).toEqual({ description: "Mine" });
    expect(applyRepresentation).toHaveBeenCalledWith(
      { ...BASE, title: "Server title" },
      ["title"]
    );
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("reviews instead of looping when a rebased retry conflicts again", async () => {
    const { scheduler, calls, results } = setup();
    results.push({
      kind: "conflict",
      latest: {
        revision: "r9",
        representation: { ...BASE, title: "Server A", description: "Old description" },
      },
    });
    results.push({
      kind: "conflict",
      latest: {
        revision: "r10",
        representation: { ...BASE, title: "Server B", description: "Old description" },
      },
    });
    scheduler.setValue({ ...BASE, description: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(2);
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.phase).toBe("conflict");
    expect(snapshot.conflict?.latestRevision).toBe("r10");
    expect(snapshot.conflict?.conflictingFields).toEqual([]);
    expect(snapshot.conflict?.changedLocally).toEqual(["description"]);
    expect(snapshot.conflict?.changedOnServer).toEqual(["title"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(2);
  });

  test("rebases a remote base update when fields are disjoint", async () => {
    const applyRepresentation = vi.fn();
    const { scheduler, calls, results } = setup({ applyRepresentation });
    scheduler.setValue({ ...BASE, description: "Mine" });
    scheduler.setBase({ ...BASE, title: "Server title" }, "r2");
    expect(applyRepresentation).toHaveBeenCalledWith(
      { ...BASE, title: "Server title" },
      ["title"]
    );
    results.push(accepted("r3", { ...BASE, title: "Server title", description: "Mine" }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    expect(calls[0].baseRevision).toBe("r2");
    expect(calls[0].fields).toEqual({ description: "Mine" });
  });

  test("opens conflict review on an overlapping remote base update", async () => {
    const { scheduler, calls, results } = setup();
    scheduler.setValue({ ...BASE, title: "Mine" });
    scheduler.setBase({ ...BASE, title: "Server title" }, "r2");
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.phase).toBe("conflict");
    expect(snapshot.conflict?.latestRevision).toBe("r2");
    expect(snapshot.conflict?.conflictingFields).toEqual(["title"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(0);
    expect(results).toHaveLength(0);
  });

  test("resolves per-field choices with one guarded write against the latest revision", async () => {
    const applyRepresentation = vi.fn();
    const { scheduler, calls, results } = setup({ applyRepresentation });
    results.push({
      kind: "conflict",
      latest: {
        revision: "r9",
        representation: { ...BASE, title: "Server title", description: "Old description" },
      },
    });
    scheduler.setValue({ ...BASE, title: "Mine", description: "Mine description" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scheduler.getSnapshot().phase).toBe("conflict");

    results.push(
      accepted("r10", { ...BASE, description: "Mine description", title: "Mine" })
    );
    const outcome = await scheduler.resolveConflict({ title: "local" });
    expect(outcome.status).toBe("accepted");
    expect(applyRepresentation).toHaveBeenCalledWith(
      { ...BASE, title: "Mine", description: "Mine description" },
      ["title", "description"]
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].intent).toBe("explicit");
    expect(calls[1].baseRevision).toBe("r9");
    expect(calls[1].fields).toEqual({ title: "Mine", description: "Mine description" });
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("adopting the latest version resolves without a write", async () => {
    const applyRepresentation = vi.fn();
    const { scheduler, calls, results } = setup({ applyRepresentation });
    results.push({
      kind: "conflict",
      latest: {
        revision: "r9",
        representation: { ...BASE, title: "Server title" },
      },
    });
    scheduler.setValue({ ...BASE, title: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = await scheduler.resolveConflict({ title: "latest" });
    expect(outcome.status).toBe("adopted");
    expect(calls).toHaveLength(1);
    expect(applyRepresentation).toHaveBeenCalledWith(
      { ...BASE, title: "Server title" },
      ["title"]
    );
    expect(scheduler.getSnapshot().phase).toBe("clean");
  });

  test("shows conflict review again when a resolution write is stale", async () => {
    const { scheduler, calls, results } = setup();
    results.push({
      kind: "conflict",
      latest: { revision: "r9", representation: { ...BASE, title: "Server title" } },
    });
    scheduler.setValue({ ...BASE, title: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    results.push({
      kind: "conflict",
      latest: { revision: "r11", representation: { ...BASE, title: "Server title 2" } },
    });
    const outcome = await scheduler.resolveConflict({ title: "local" });
    expect(outcome.status).toBe("conflict");
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.phase).toBe("conflict");
    expect(snapshot.conflict?.latestRevision).toBe("r11");
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(2);
  });

  test("explicit save during a conflict keeps local values as a guarded write", async () => {
    const { scheduler, calls, results } = setup();
    results.push({
      kind: "conflict",
      latest: { revision: "r9", representation: { ...BASE, title: "Server title" } },
    });
    scheduler.setValue({ ...BASE, title: "Mine" });
    await vi.advanceTimersByTimeAsync(2_000);
    results.push(accepted("r10", { ...BASE, title: "Mine" }));
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("accepted");
    expect(calls[1].intent).toBe("explicit");
    expect(calls[1].baseRevision).toBe("r9");
    expect(calls[1].fields).toEqual({ title: "Mine" });
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("pauses on authorization errors until an explicit save retries", async () => {
    const { scheduler, calls, results } = setup();
    results.push({ kind: "unauthorized" });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scheduler.getSnapshot().phase).toBe("auth-paused");
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls).toHaveLength(1);
    results.push(accepted("r2", { ...BASE, title: "New" }));
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("accepted");
    expect(calls).toHaveLength(2);
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("blocks saving when the record is gone", async () => {
    const { scheduler, calls, results } = setup();
    results.push({ kind: "gone" });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scheduler.getSnapshot().phase).toBe("gone-blocked");
    scheduler.setValue({ ...BASE, title: "Newer" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
    const outcome = await scheduler.saveNow();
    expect(outcome.status).toBe("gone");
  });

  test("treats an adapter offline result as paused and resumes when online again", async () => {
    const { scheduler, calls, results } = setup();
    results.push({ kind: "offline" });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scheduler.getSnapshot().phase).toBe("offline-paused");
    scheduler.setOnline(true);
    results.push(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(scheduler.getSnapshot().phase).toBe("saved");
  });

  test("reset aborts an in-flight write and drops its late acknowledgement", async () => {
    const { scheduler, calls, results } = setup();
    const pending = deferred<LiveSaveWriteResult<Fields>>();
    results.push(pending.promise);
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    const signal = calls[0].signal;
    expect(signal.aborted).toBe(false);
    scheduler.reset({ value: { ...OTHER }, base: { ...OTHER }, baseRevision: "x1", enabled: true });
    expect(signal.aborted).toBe(true);
    pending.resolve(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(0);
    const snapshot = scheduler.getSnapshot();
    expect(snapshot.savedAt).toBeNull();
    expect(snapshot.phase).toBe("clean");
    expect(calls).toHaveLength(1);
  });

  test("disabling stops timers and re-enabling resumes scheduling", async () => {
    const { scheduler, calls, results } = setup();
    scheduler.setValue({ ...BASE, title: "New" });
    scheduler.setEnabled(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
    scheduler.setEnabled(true);
    results.push(accepted("r2", { ...BASE, title: "New" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
  });

  test("setCallbacks re-points the adapter and onAccepted for subsequent sends", async () => {
    const { scheduler } = setup();
    const routed: LiveSaveWriteInput<Fields>[] = [];
    const replacement: LiveSaveAdapter<Fields> = {
      save: vi.fn(async (input) => {
        routed.push(input);
        return accepted("r2", { ...BASE, title: "New" });
      }),
    };
    const onAccepted = vi.fn();
    scheduler.setCallbacks({ adapter: replacement, onAccepted });
    scheduler.setValue({ ...BASE, title: "New" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(routed).toHaveLength(1);
    expect(routed[0].fields).toEqual({ title: "New" });
    expect(onAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ revision: "r2", fullySynced: true })
    );
  });
});
