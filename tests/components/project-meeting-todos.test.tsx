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

  test("filters the queue to todos assigned to the signed-in user", () => {
    mockSearchParams = new URLSearchParams("responsibility=mine");
    const assignedTodo: ProjectMeetingTodoItem = {
      ...ownerTodo,
      id: "todo-assigned",
      content: "Owned follow-up",
      assignee: {
        kind: "human",
        id: "user-1",
        displayName: "owner",
        usernameTag: "owner#0001",
        avatarSeed: "seed-owner",
        status: "active",
        isAssignable: true,
      },
    };
    const result = renderToStaticMarkup(
      <ProjectMeetingTodos
        projectId="project-1"
        canEdit
        currentActorUserId="user-1"
        actors={[assignedTodo.assignee!]}
        initialTodos={[ownerTodo, assignedTodo]}
      />
    );

    expect(result).toContain("Owned follow-up");
    expect(result).not.toContain("Confirm the mobile navigation pattern");
    expect(result).toContain('aria-label="Todo responsibility"');
    expect(result).toContain("Assigned to me");
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

  test("completes editable todos immediately and reconciles without a broad refresh", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
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
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/meeting-notes/meeting-1/actions/todo-owner",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ completed: true }),
      })
    );
    expect(container.textContent).not.toContain(
      "Confirm the mobile navigation pattern"
    );
    expect(container.textContent).toContain("All caught up");
    expect(navigationMock.refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            note: {
              status: "actions_in_progress",
              actions: [
                {
                  id: "todo-owner",
                  completedAt: "2026-07-20T12:00:00.000Z",
                  completedBy: null,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Todo completed.");
    expect(navigationMock.refresh).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });

  test("restores the todo and surfaces an error when completion fails", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
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
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      container.querySelector(
        'button[aria-label="Complete todo: Confirm the mobile navigation pattern"]'
      )
    ).not.toBeNull();
    expect(container.textContent).toContain("Overdue");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not update this todo. Check your access and retry."
    );
    expect(navigationMock.refresh).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });

  test("reopens a completed todo optimistically from the completed view", async () => {
    mockSearchParams = new URLSearchParams("view=completed");
    const completedTodo: ProjectMeetingTodoItem = {
      ...ownerTodo,
      completedAt: "2026-07-20T11:00:00.000Z",
      isOverdue: false,
      completedBy: {
        kind: "human",
        id: "user-1",
        displayName: "owner",
        usernameTag: "owner#0001",
        avatarSeed: "seed-owner",
        status: "active",
        isAssignable: true,
      },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    await act(async () => {
      root.render(
        <ProjectMeetingTodos
          projectId="project-1"
          canEdit
          initialTodos={[completedTodo]}
        />
      );
    });

    const reopenButton = container.querySelector(
      'button[aria-label="Reopen todo: Confirm the mobile navigation pattern"]'
    ) as HTMLButtonElement;
    expect(reopenButton).not.toBeNull();
    await act(async () => {
      reopenButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/meeting-notes/meeting-1/actions/todo-owner",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ completed: false }),
      })
    );
    expect(container.textContent).toContain("No completed todos yet");
    expect(navigationMock.refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            note: {
              status: "actions_in_progress",
              actions: [
                { id: "todo-owner", completedAt: null, completedBy: null },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Todo reopened.");

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });

  test("recomputes sibling overdue metadata when reopening a done meeting's todo", async () => {
    mockSearchParams = new URLSearchParams("view=completed");
    const doneMeeting = {
      id: "meeting-done",
      title: "Closed review",
      scheduledAt: "2026-07-01T09:00:00.000Z",
      status: "done",
    };
    const completedTodo: ProjectMeetingTodoItem = {
      ...ownerTodo,
      id: "todo-reopen",
      content: "Close the audit loop",
      completedAt: "2026-07-20T11:00:00.000Z",
      isOverdue: false,
      meeting: doneMeeting,
    };
    const openSibling: ProjectMeetingTodoItem = {
      ...ownerTodo,
      id: "todo-sibling",
      content: "Ship the release notes",
      isOverdue: false,
      meeting: { ...doneMeeting },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            note: {
              status: "actions_in_progress",
              actions: [{ id: "todo-reopen", completedAt: null, completedBy: null }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    await act(async () => {
      root.render(
        <ProjectMeetingTodos
          projectId="project-1"
          canEdit
          initialTodos={[completedTodo, openSibling]}
        />
      );
    });

    const summaryValues = () =>
      Array.from(
        container.querySelectorAll(
          'section[aria-label="Todo summary"] p.tabular-nums'
        )
      ).map((element) => element.textContent);

    expect(summaryValues()).toEqual(["1", "0"]);

    const reopenButton = container.querySelector(
      'button[aria-label="Reopen todo: Close the audit loop"]'
    ) as HTMLButtonElement;
    expect(reopenButton).not.toBeNull();
    await act(async () => {
      reopenButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Optimistically the reopened todo joins the open list and both open
    // todos become overdue once the meeting leaves the done status.
    expect(summaryValues()).toEqual(["2", "2"]);
    expect(container.textContent).toContain("No completed todos yet");

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });

  test("does not roll back a sibling's acknowledged meeting status when another reopen fails", async () => {
    mockSearchParams = new URLSearchParams("view=completed");
    const doneMeeting = {
      id: "meeting-done",
      title: "Closed review",
      scheduledAt: "2026-07-01T09:00:00.000Z",
      status: "done",
    };
    const completedA: ProjectMeetingTodoItem = {
      ...ownerTodo,
      id: "todo-a",
      content: "Close the audit loop",
      completedAt: "2026-07-20T11:00:00.000Z",
      isOverdue: false,
      meeting: doneMeeting,
    };
    const completedB: ProjectMeetingTodoItem = {
      ...ownerTodo,
      id: "todo-b",
      content: "Ship the release notes",
      completedAt: "2026-07-21T11:00:00.000Z",
      isOverdue: false,
      meeting: { ...doneMeeting },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let resolveA!: (value: Response) => void;
    let resolveB!: (value: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveA = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveB = resolve;
          })
      );

    await act(async () => {
      root.render(
        <ProjectMeetingTodos
          projectId="project-1"
          canEdit
          initialTodos={[completedA, completedB]}
        />
      );
    });

    const summaryValues = () =>
      Array.from(
        container.querySelectorAll(
          'section[aria-label="Todo summary"] p.tabular-nums'
        )
      ).map((element) => element.textContent);

    expect(summaryValues()).toEqual(["0", "0"]);

    const reopenA = container.querySelector(
      'button[aria-label="Reopen todo: Close the audit loop"]'
    ) as HTMLButtonElement;
    const reopenB = container.querySelector(
      'button[aria-label="Reopen todo: Ship the release notes"]'
    ) as HTMLButtonElement;
    expect(reopenA).not.toBeNull();
    expect(reopenB).not.toBeNull();
    await act(async () => {
      reopenA.click();
      await Promise.resolve();
    });
    await act(async () => {
      reopenB.click();
      await Promise.resolve();
    });

    // Both reopens are optimistic; the done meeting is predicted to flip back
    // to actions_in_progress, so both open todos read as overdue.
    expect(summaryValues()).toEqual(["2", "2"]);

    // B's reopen commits actions_in_progress; A is still awaiting a response.
    await act(async () => {
      resolveB(
        new Response(
          JSON.stringify({
            note: {
              status: "actions_in_progress",
              actions: [{ id: "todo-b", completedAt: null, completedBy: null }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(summaryValues()).toEqual(["2", "2"]);

    // A's reopen then fails: only A's completion rolls back. The meeting
    // status B already committed must survive, so B stays overdue.
    await act(async () => {
      resolveA(
        new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      container.querySelector(
        'button[aria-label="Reopen todo: Close the audit loop"]'
      )
    ).not.toBeNull();
    expect(summaryValues()).toEqual(["1", "1"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not update this todo. Check your access and retry."
    );
    expect(navigationMock.refresh).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockRestore();
  });
});
