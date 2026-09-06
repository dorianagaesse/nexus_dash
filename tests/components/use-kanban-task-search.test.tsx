// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useKanbanTaskSearch } from "@/components/kanban/use-kanban-task-search";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();

function Harness({ query, revision }: { query: string; revision: string }) {
  const result = useKanbanTaskSearch({
    projectId: "project-1",
    query,
    searchableTaskRevision: revision,
  });
  return (
    <div>
      <span data-loading={result.isLoading}>{result.isLoading ? "loading" : "idle"}</span>
      <span data-ids>{result.searchTaskIds ? Array.from(result.searchTaskIds).join(",") : "all"}</span>
      <span data-error>{result.error ?? "none"}</span>
      <button type="button" onClick={result.retry}>Retry</button>
    </div>
  );
}

function render(root: Root, query: string, revision = "revision-1") {
  act(() => root.render(<Harness query={query} revision={revision} />));
}

describe("useKanbanTaskSearch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("debounces 200 ms and retains the last applied IDs while refreshing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ taskIds: ["task-alpha"] }),
    });
    render(root, " alpha ");

    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-alpha");

    let resolveRefresh!: (response: unknown) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRefresh = resolve; })
    );
    render(root, "beta");
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-alpha");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(container.querySelector("[data-loading]")?.textContent).toBe("loading");
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-alpha");

    await act(async () => {
      resolveRefresh({
        ok: true,
        json: vi.fn().mockResolvedValue({ taskIds: ["task-beta"] }),
      });
      await Promise.resolve();
    });
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-beta");
  });

  test("aborts stale requests and reruns for searchable revision changes", async () => {
    let staleSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      staleSignal = init?.signal as AbortSignal;
      return new Promise(() => undefined);
    });
    render(root, "alpha");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(staleSignal?.aborted).toBe(false);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ taskIds: ["task-beta"] }),
    });
    render(root, "beta");
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-beta");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ taskIds: ["task-beta", "task-new"] }),
    });
    render(root, "beta", "revision-2");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector("[data-ids]")?.textContent).toBe(
      "task-beta,task-new"
    );
  });

  test("retains results on failure, retries, and clears immediately", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ taskIds: ["task-alpha"] }),
    });
    render(root, "alpha");
    await act(async () => vi.advanceTimersByTimeAsync(200));

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Search service unavailable." }),
    });
    render(root, "beta");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-alpha");
    expect(container.querySelector("[data-error]")?.textContent).toBe(
      "Search service unavailable."
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ taskIds: ["task-beta"] }),
    });
    await act(async () => {
      container.querySelector("button")!.click();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(container.querySelector("[data-ids]")?.textContent).toBe("task-beta");
    expect(container.querySelector("[data-error]")?.textContent).toBe("none");

    render(root, "   ");
    expect(container.querySelector("[data-ids]")?.textContent).toBe("all");
    expect(container.querySelector("[data-loading]")?.textContent).toBe("idle");
  });

  test("uses a safe fallback for non-Error request failures", async () => {
    fetchMock.mockRejectedValueOnce("offline");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(root, "alpha");
    await act(async () => vi.advanceTimersByTimeAsync(200));

    expect(container.querySelector("[data-error]")?.textContent).toBe(
      "Could not search tasks."
    );
    consoleError.mockRestore();
  });
});
