import { describe, expect, test, vi } from "vitest";

import {
  createContentSaveAdapter,
  type ContentSaveAdapterConfig,
} from "@/lib/live-save/content-adapter";

type Shape = Record<string, unknown> & { title: string; description: string };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeAdapter(
  fetchImpl: typeof fetch,
  overrides: Partial<ContentSaveAdapterConfig<Shape>> = {}
) {
  return createContentSaveAdapter<Shape>({
    domain: "task",
    entityId: "task-1",
    url: "/api/projects/project-1/tasks/task-1",
    buildPayload: (fields, intent) => ({
      ...fields,
      ...(intent === "explicit" ? { assigneeUserId: "user-2" } : {}),
    }),
    mapAccepted: (body) => {
      const task = (body as { task?: { title?: string; description?: string; contentRevision?: number } } | null)?.task;
      return task?.contentRevision === undefined
        ? null
        : {
            representation: { title: task.title ?? "", description: task.description ?? "" },
            revision: task.contentRevision,
          };
    },
    mapConflict: (body) => {
      const current = (body as { current?: { title?: string; description?: string; contentRevision?: number } } | null)?.current;
      return current?.contentRevision === undefined
        ? null
        : {
            representation: { title: current.title ?? "", description: current.description ?? "" },
            revision: current.contentRevision,
          };
    },
    fetchImpl,
    ...overrides,
  });
}

describe("content save adapter", () => {
  test("sends dirty fields with the entity precondition and intent", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { task: { title: "New title", description: "Body", contentRevision: 8 } })
    ) as unknown as typeof fetch;
    const adapter = makeAdapter(fetchImpl);

    const result = await adapter.save({
      fields: { title: "New title" },
      baseRevision: 7,
      intent: "autosave",
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      kind: "accepted",
      revision: 8,
      representation: { title: "New title", description: "Body" },
    });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/projects/project-1/tasks/task-1");
    expect(init).toMatchObject({ method: "PATCH", body: JSON.stringify({ title: "New title" }) });
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Content-If-Match")).toBe('"task:task-1:7"');
    expect(headers.get("NexusDash-Mutation-Intent")).toBe("autosave");
    expect(headers.has("If-Match")).toBe(false);
  });

  test("lets explicit intent add command fields while autosave omits them", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { task: { title: "Title", description: "", contentRevision: 2 } })
    ) as unknown as typeof fetch;
    const adapter = makeAdapter(fetchImpl);

    await adapter.save({
      fields: { title: "Title" },
      baseRevision: 1,
      intent: "explicit",
      signal: new AbortController().signal,
    });

    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Title", assigneeUserId: "user-2" });
    expect(new Headers(init?.headers).get("NexusDash-Mutation-Intent")).toBe("explicit");
  });

  test("maps a stale precondition to the latest authorized representation", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(412, {
        error: "edit-conflict",
        contentRevision: 9,
        current: { title: "Server title", description: "Server body", contentRevision: 9 },
      })
    ) as unknown as typeof fetch;

    const result = await makeAdapter(fetchImpl).save({
      fields: { description: "Mine" },
      baseRevision: 7,
      intent: "explicit",
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      kind: "conflict",
      latest: {
        revision: 9,
        representation: { title: "Server title", description: "Server body" },
      },
    });
  });

  test("treats transport and malformed-precondition rejections as permanent contract failures", async () => {
    for (const error of ["edit-precondition-transport", "edit-precondition-invalid"]) {
      const fetchImpl = vi.fn(async () => jsonResponse(400, { error })) as unknown as typeof fetch;
      await expect(
        makeAdapter(fetchImpl).save({
          fields: { title: "Title" },
          baseRevision: 3,
          intent: "autosave",
          signal: new AbortController().signal,
        })
      ).resolves.toEqual({ kind: "failed", message: error, retryable: false });
    }
  });

  test("maps validation, auth, and missing-entity responses", async () => {
    const cases: Array<[number, unknown, unknown]> = [
      [422, { error: "title-too-long" }, { kind: "invalid", message: "title-too-long" }],
      [401, { error: "unauthorized" }, { kind: "unauthorized" }],
      [403, { error: "forbidden" }, { kind: "unauthorized" }],
      [404, { error: "Task not found" }, { kind: "gone" }],
      [428, { error: "precondition-required" }, { kind: "failed", message: "precondition-required", retryable: false }],
      [503, { error: "unavailable" }, { kind: "failed", message: "unavailable", retryable: true }],
    ];
    for (const [status, body, expected] of cases) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, body)) as unknown as typeof fetch;
      await expect(
        makeAdapter(fetchImpl).save({
          fields: { title: "Title" },
          baseRevision: 3,
          intent: "autosave",
          signal: new AbortController().signal,
        })
      ).resolves.toEqual(expected);
    }
  });

  test("resolves offline on network failure and keeps aborts retryable", async () => {
    const offlineFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(
      makeAdapter(offlineFetch).save({
        fields: { title: "Title" },
        baseRevision: 1,
        intent: "autosave",
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ kind: "offline" });

    const controller = new AbortController();
    const abortingFetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;
    await expect(
      makeAdapter(abortingFetch).save({
        fields: { title: "Title" },
        baseRevision: 1,
        intent: "explicit",
        signal: controller.signal,
      })
    ).resolves.toEqual({ kind: "failed", message: "The save was cancelled.", retryable: true });
  });

  test("refuses to send without a usable revision or payload", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const adapter = makeAdapter(fetchImpl);

    await expect(
      adapter.save({
        fields: { title: "Title" },
        baseRevision: "not-a-revision",
        intent: "autosave",
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ kind: "failed", message: "The saved revision is unavailable.", retryable: false });

    await expect(
      adapter.save({
        fields: {},
        baseRevision: 1,
        intent: "autosave",
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ kind: "failed", message: "There are no changes to save.", retryable: false });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("treats a 2xx without an authoritative representation as a permanent failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true })) as unknown as typeof fetch;
    await expect(
      makeAdapter(fetchImpl).save({
        fields: { title: "Title" },
        baseRevision: 1,
        intent: "explicit",
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ kind: "failed", message: "The save response was incomplete.", retryable: false });
  });
});
