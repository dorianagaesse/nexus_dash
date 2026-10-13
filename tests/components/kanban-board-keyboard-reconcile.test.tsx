// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import type { KanbanTask } from "@/components/kanban-board-types";

const capture = vi.hoisted(() => ({ grid: null as any }));
vi.mock("@/components/kanban/kanban-columns-grid", () => ({
  KanbanColumnsGrid: (props: any) => {
    capture.grid = props;
    return null;
  },
}));
vi.mock("@/components/toast-provider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock("@/components/create-task-dialog", () => ({
  CreateTaskDialog: () => null,
}));
vi.mock("@/components/kanban/task-detail-modal", () => ({
  TaskDetailModal: () => null,
}));
vi.mock("@/components/kanban/kanban-board-header", () => ({
  KanbanBoardHeader: () => null,
}));
vi.mock("@/components/kanban/kanban-filter-bar", () => ({
  KanbanFilterBar: () => null,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("@/lib/hooks/use-recovery-draft", () => ({
  recoveryDraftKey: () => "draft",
  useRecoveryDraft: () => ({ flush: vi.fn(), saved: vi.fn(), discard: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-project-section-expanded", () => ({
  useProjectSectionExpanded: () => ({ isExpanded: true, setIsExpanded: vi.fn() }),
}));
vi.mock("@/components/kanban/use-kanban-task-search", () => ({
  useKanbanTaskSearch: () => ({
    normalizedQuery: "",
    searchTaskIds: null,
    isLoading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

import { KanbanBoard } from "@/components/kanban-board";
import { dispatchProjectActivityRemoteEvent } from "@/lib/project-activity-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const person = {
  id: "owner",
  displayName: "Owner",
  usernameTag: null,
  avatarSeed: null,
};

function makeTasks(ids: string[]): KanbanTask[] {
  return ids.map((id, position) => ({
    id,
    reference: `ND-${position}`,
    title: id,
    description: null,
    deadlineDate: null,
    commentCount: 0,
    labels: [],
    blockedFollowUps: [],
    status: "Backlog",
    position,
    archivedAt: null,
    attachments: [],
    relatedTasks: [],
    epic: null,
    assignee: null,
    createdBy: person,
    updatedBy: person,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  })) as KanbanTask[];
}

function dispatchReorderEvent(taskIds: string[]): boolean {
  return dispatchProjectActivityRemoteEvent({
    eventId: "event",
    projectId: "project",
    version: "2",
    serverTime: "2026-10-12T00:00:00Z",
    actorUserId: "other",
    domain: "task",
    action: "reordered",
    entityId: null,
    payload: { reorder: { columns: [{ status: "Backlog", taskIds }] } },
  });
}

const source = { droppableId: "Backlog", index: 0 };
const destination = { droppableId: "Backlog", index: 1 };

function backlogOrder(): string[] {
  return capture.grid.columns.Backlog.map((task: KanbanTask) => task.id);
}

async function renderBoard(initialTasks: KanbanTask[]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <KanbanBoard
        canEdit
        projectId="project"
        actorUserId="owner"
        storageProvider="local"
        initialTasks={initialTasks}
        archivedDoneTasks={[]}
        archivedEpics={[]}
        projectActors={[]}
        epics={[]}
        collaborators={[person]}
      />
    );
  });
  return { container, root };
}

async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("an acknowledged keyboard move is not applied twice after a typed reorder lands first", async () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { root } = await renderBoard(makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The acknowledged order arrives (typed event or refetch) while the drop
    // animation is still completing.
    await act(async () => {
      expect(dispatchReorderEvent(["b", "a", "c"])).toBe(true);
    });
    expect(backlogOrder()).toEqual(["b", "a", "c"]);

    await act(async () => {
      capture.grid.onDragEnd({
        draggableId: "a",
        mode: "SNAP",
        type: "DEFAULT",
        source,
        destination,
        reason: "DROP",
        combine: null,
      });
    });

    // The final handler must not re-move whichever card now holds index 0.
    expect(backlogOrder()).toEqual(["b", "a", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("reconcile moves the submitted task by identity when a remote reorder shifted it", async () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { root } = await renderBoard(makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The remote layout keeps every other card's order and parks the
    // submitted task at the end.
    await act(async () => {
      expect(dispatchReorderEvent(["c", "b", "a"])).toBe(true);
    });
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    await act(async () => {
      capture.grid.onDragEnd({
        draggableId: "a",
        mode: "SNAP",
        type: "DEFAULT",
        source,
        destination,
        reason: "DROP",
        combine: null,
      });
    });

    // The submitted task moves from where it now sits; the other cards keep
    // their remote order.
    expect(backlogOrder()).toEqual(["c", "a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("an early persist failure keeps the stored order when the drop settles", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock = vi.fn(async () => {
    throw new Error("network down");
  });
  vi.stubGlobal("fetch", fetchMock);
  const { container, root } = await renderBoard(makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    await flushAsync();
    expect(backlogOrder()).toEqual(["a", "b", "c"]);
    expect(container.textContent).toContain("Could not save task movement");

    await act(async () => {
      capture.grid.onDragEnd({
        draggableId: "a",
        mode: "SNAP",
        type: "DEFAULT",
        source,
        destination,
        reason: "DROP",
        combine: null,
      });
    });

    // The failed acknowledgement must not apply the drop locally.
    expect(backlogOrder()).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  }
});

test("a late persist failure reverts the optimistic move applied at drop settle", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectPersist: (error: Error) => void = () => {};
  const pendingResponse = new Promise<Response>((_resolve, reject) => {
    rejectPersist = reject;
  });
  const fetchMock = vi.fn(() => pendingResponse);
  vi.stubGlobal("fetch", fetchMock);
  const { container, root } = await renderBoard(makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The drop settles while the early request is still in flight.
    await act(async () => {
      capture.grid.onDragEnd({
        draggableId: "a",
        mode: "SNAP",
        type: "DEFAULT",
        source,
        destination,
        reason: "DROP",
        combine: null,
      });
    });
    expect(backlogOrder()).toEqual(["b", "a", "c"]);

    // The early request then fails: the board reverts to the stored order.
    await act(async () => {
      rejectPersist(new Error("network down"));
    });
    await flushAsync();
    expect(backlogOrder()).toEqual(["a", "b", "c"]);
    expect(container.textContent).toContain("Could not save task movement");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  }
});
