// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useProjectTodoSummary } from "@/lib/hooks/use-project-todo-summary";
import {
  PROJECT_ACTIVITY_MUTATION_EVENT,
  PROJECT_ACTIVITY_REMOTE_EVENT,
} from "@/lib/project-activity-client";

(globalThis as { React?: typeof React }).React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function SummaryHarness({ projectId }: { projectId: string | null }) {
  const summary = useProjectTodoSummary(projectId);
  return (
    <div>
      {summary ? `${summary.activeCount}:${summary.hasOverdue}` : "none"}
    </div>
  );
}

describe("project todo summary hook", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("loads and refreshes the current project after todo activity", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ activeCount: 2, hasOverdue: true }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ activeCount: 1, hasOverdue: false }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ activeCount: 3, hasOverdue: false }), {
          status: 200,
        })
      );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SummaryHarness projectId="project-1" />);
    });
    expect(container.textContent).toBe("2:true");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PROJECT_ACTIVITY_MUTATION_EVENT, {
          detail: { projectId: "project-1", phase: "finish" },
        })
      );
    });
    expect(container.textContent).toBe("1:false");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PROJECT_ACTIVITY_REMOTE_EVENT, {
          detail: {
            activity: { projectId: "project-1", domain: "meeting-note" },
          },
        })
      );
    });
    expect(container.textContent).toBe("3:false");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/project-1/meeting-todos/summary",
      { cache: "no-store" }
    );

    await act(async () => root.unmount());
  });

  test("ignores unrelated activity and clears invalid responses", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ activeCount: -1, hasOverdue: false }), {
        status: 200,
      })
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SummaryHarness projectId="project-1" />);
    });
    expect(container.textContent).toBe("none");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PROJECT_ACTIVITY_MUTATION_EVENT, {
          detail: { projectId: "project-2", phase: "finish" },
        })
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});
