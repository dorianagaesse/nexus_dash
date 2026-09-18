// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const projectSectionExpandedMock = vi.hoisted(() => ({
  isExpanded: false,
  setIsExpanded: vi.fn(),
}));

vi.mock("@/lib/hooks/use-project-section-expanded", () => ({
  useProjectSectionExpanded: () => projectSectionExpandedMock,
}));

import { ProjectTimelinePanel } from "@/components/project-timeline-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

async function renderWithRoot(root: Root, ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(container: HTMLElement, labelFragment: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(labelFragment)
  );
}

function humanEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    domain: "task",
    action: "updated",
    entityId: "task-1",
    entityDisplayNameSnapshot: "Ship the timeline",
    summary: 'Updated task "Ship the timeline"',
    changes: [{ field: "status", before: "Backlog", after: "Done" }],
    version: "2026-09-18T10:00:00.000Z",
    createdAt: "2026-09-18T10:00:01.000Z",
    actor: {
      kind: "human",
      id: "user-1",
      displayName: "Alice Example",
      usernameTag: "alice#0001",
      avatarSeed: "seed-alice",
      status: "active",
      isAssignable: true,
    },
    ...overrides,
  };
}

describe("project-timeline-panel", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    projectSectionExpandedMock.isExpanded = false;
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("does not query history while the section is collapsed", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectTimelinePanel, { projectId: "project-1" })
    );

    expect(container.textContent).toContain("Timeline");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("renders history entries with actors, summaries, and bounded changes", async () => {
    projectSectionExpandedMock.isExpanded = true;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          humanEntry(),
          humanEntry({
            id: "event-2",
            summary: 'Updated task "Ship the timeline"',
            changes: null,
            entityDisplayNameSnapshot: "Ship the timeline",
            actor: {
              kind: "agent",
              id: "credential-1",
              displayName: "Build bot",
              usernameTag: null,
              avatarSeed: null,
              status: "revoked",
              isAssignable: false,
            },
            version: "2026-09-18T09:00:00.000Z",
          }),
          humanEntry({
            id: "event-3",
            summary: null,
            changes: null,
            entityId: "task-3",
            entityDisplayNameSnapshot: "Retrying the deploy",
            actor: null,
            version: "2026-09-18T08:00:00.000Z",
          }),
        ],
        nextCursor: null,
      }),
    });

    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectTimelinePanel, { projectId: "project-1" })
    );
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/history?take=25",
      {
        method: "GET",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }
    );

    const firstEntry = container.querySelector(
      "[data-timeline-entry='event-1']"
    );
    expect(firstEntry?.textContent).toContain("Alice Example");
    expect(firstEntry?.textContent).toContain(
      'Updated task "Ship the timeline"'
    );
    expect(firstEntry?.textContent).toContain("status: Backlog → Done");
    expect(
      firstEntry?.querySelector("time")?.getAttribute("datetime")
    ).toBe("2026-09-18T10:00:00.000Z");

    const secondEntry = container.querySelector(
      "[data-timeline-entry='event-2']"
    );
    expect(secondEntry?.textContent).toContain("Build bot");
    expect(secondEntry?.textContent).toContain("revoked credential");
    expect(secondEntry?.querySelector("[data-agent-avatar='true']")).not.toBeNull();

    const thirdEntry = container.querySelector(
      "[data-timeline-entry='event-3']"
    );
    expect(thirdEntry?.textContent).toContain("Unknown actor");
    expect(thirdEntry?.textContent).toContain("Retrying the deploy");

    await act(async () => {
      root.unmount();
    });
  });

  test("appends the next history page when loading more", async () => {
    projectSectionExpandedMock.isExpanded = true;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [humanEntry()], nextCursor: "cursor-2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            humanEntry({
              id: "event-2",
              version: "2026-09-18T09:00:00.000Z",
            }),
          ],
          nextCursor: null,
        }),
      });

    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectTimelinePanel, { projectId: "project-1" })
    );
    await flushAsyncWork();

    const loadMoreButton = findButton(container, "Load more");
    expect(loadMoreButton).not.toBeUndefined();

    await act(async () => {
      loadMoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/project-1/history?take=25&cursor=cursor-2",
      {
        method: "GET",
        cache: "no-store",
        signal: undefined,
      }
    );
    expect(
      container.querySelector("[data-timeline-entry='event-1']")
    ).not.toBeNull();
    expect(
      container.querySelector("[data-timeline-entry='event-2']")
    ).not.toBeNull();
    expect(findButton(container, "Load more")).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });

  test("surfaces load failures and retries the first page", async () => {
    projectSectionExpandedMock.isExpanded = true;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid-cursor" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [humanEntry()], nextCursor: null }),
      });

    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectTimelinePanel, { projectId: "project-1" })
    );
    await flushAsyncWork();

    expect(container.textContent).toContain("invalid-cursor");

    const retryButton = findButton(container, "Retry");
    expect(retryButton).not.toBeUndefined();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(container.textContent).not.toContain("invalid-cursor");
    expect(
      container.querySelector("[data-timeline-entry='event-1']")
    ).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
