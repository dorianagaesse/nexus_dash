// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMock,
  useSearchParams: () => mockSearchParams,
}));

import {
  ProjectMeetingTodos,
  type ProjectMeetingTodoItem,
} from "@/components/meeting-todos/project-meeting-todos";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ownerTodo: ProjectMeetingTodoItem = {
  id: "todo-owner",
  content: "Confirm the mobile navigation pattern",
  completedAt: null,
  updatedAt: "2026-07-20T10:00:00.000Z",
  isOverdue: true,
  meeting: {
    id: "meeting-1",
    title: "Mobile launch readiness",
    scheduledAt: "2026-07-10T09:00:00.000Z",
    status: "actions_in_progress",
  },
};

describe("project meeting todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  test("renders project route-backed views, source context, and touch-sized controls", () => {
    const result = renderToStaticMarkup(
      <ProjectMeetingTodos
        projectId="project-1"
        canEdit
        initialTodos={[ownerTodo]}
      />
    );

    expect(result).toContain('aria-label="Todo views"');
    expect(result).toContain('href="/projects/project-1/todos"');
    expect(result).toContain(
      'href="/projects/project-1/todos?view=completed"'
    );
    expect(result).toContain(
      "/projects/project-1?meetingNoteId=meeting-1&amp;meetingTodoId=todo-owner"
    );
    expect(result).toContain(
      "Complete todo: Confirm the mobile navigation pattern"
    );
    expect(result).toContain("h-11 w-11");
    expect(result).toContain("Overdue");
  });

  test("uses URL state for the completed view and respects view-only access", () => {
    mockSearchParams = new URLSearchParams("view=completed");
    const completedTodo = {
      ...ownerTodo,
      completedAt: "2026-07-20T11:00:00.000Z",
      isOverdue: false,
    };

    const result = renderToStaticMarkup(
      <ProjectMeetingTodos
        projectId="project-1"
        canEdit={false}
        initialTodos={[completedTodo]}
      />
    );

    expect(result).toContain('aria-current="page"');
    expect(result).toContain('href="/projects/project-1/todos"');
    expect(result).toContain("view only");
    expect(result).not.toContain(
      "Reopen todo: Confirm the mobile navigation pattern"
    );
  });

  test("renders the server-provided load error", () => {
    const result = renderToStaticMarkup(
      <ProjectMeetingTodos
        projectId="project-1"
        canEdit={false}
        initialTodos={[]}
        loadError="Meeting todos are temporarily unavailable."
      />
    );

    expect(result).toContain("Meeting todos are temporarily unavailable.");
  });

  test("completes editable todos with pending-safe feedback and refresh", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ note: { id: "meeting-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    await act(async () => {
      root.render(
        <ProjectMeetingTodos
          projectId="project-1"
          canEdit
          initialTodos={[ownerTodo]}
        />
      );
    });

    const completeButton = container.querySelector(
      'button[aria-label="Complete todo: Confirm the mobile navigation pattern"]'
    ) as HTMLButtonElement;
    await act(async () => {
      completeButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/meeting-notes/meeting-1/actions/todo-owner",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ completed: true }),
      })
    );
    expect(container.textContent).toContain("Todo completed.");
    expect(container.textContent).toContain("All caught up");
    expect(navigationMock.refresh).toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });
});
