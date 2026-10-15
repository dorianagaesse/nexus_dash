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
vi.mock("@/lib/project-epic-client", () => ({
  PROJECT_EPICS_RECONCILED_EVENT: "project-epics-reconciled",
  reconcileProjectEpics: vi.fn(),
  reconcileProjectEpicsAfterTaskMutation: vi.fn(),
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

function reorderActivity(taskIds: string[], version: string) {
  return {
    eventId: `event-${version}`,
    projectId: "project",
    version,
    serverTime: "2026-10-12T00:00:00Z",
    actorUserId: "other",
    domain: "task",
    action: "reordered",
    entityId: null,
    payload: { reorder: { columns: [{ status: "Backlog", taskIds }] } },
  } as const;
}

function dispatchReorderEvent(
  taskIds: string[],
  version = "2026-10-12T00:00:02.000Z"
): boolean {
  return dispatchProjectActivityRemoteEvent(reorderActivity(taskIds, version));
}

function dispatchCreatedEvent(task: Partial<Record<string, unknown>>, version: string): boolean {
  return dispatchProjectActivityRemoteEvent({
    eventId: `event-${version}`,
    projectId: "project",
    version,
    serverTime: "2026-10-12T00:00:00Z",
    actorUserId: "other",
    domain: "task",
    action: "created",
    entityId: null,
    payload: { task: { ...task, createdBy: person, updatedBy: person } },
  });
}

function dispatchUpdatedEvent(task: Partial<Record<string, unknown>>, version: string): boolean {
  return dispatchProjectActivityRemoteEvent({
    eventId: `event-${version}`,
    projectId: "project",
    version,
    serverTime: "2026-10-12T00:00:00Z",
    actorUserId: "other",
    domain: "task",
    action: "updated",
    entityId: typeof task.id === "string" ? task.id : null,
    payload: { task: { ...task, createdBy: person, updatedBy: person } },
  });
}

const source = { droppableId: "Backlog", index: 0 };
const destination = { droppableId: "Backlog", index: 1 };
const MOUNT_VERSION = "2026-10-12T00:00:00.000Z";

function backlogOrder(): string[] {
  return capture.grid.columns.Backlog.map((task: KanbanTask) => task.id);
}

function dropResult() {
  return {
    draggableId: "a",
    mode: "SNAP",
    type: "DEFAULT",
    source,
    destination,
    reason: "DROP",
    combine: null,
  } as const;
}

async function renderBoard(
  root: ReturnType<typeof createRoot>,
  initialTasks: KanbanTask[],
  activityVersion: string | null = MOUNT_VERSION
) {
  await act(async () => {
    root.render(
      <KanbanBoard
        canEdit
        projectId="project"
        actorUserId="owner"
        storageProvider="local"
        initialTasks={initialTasks}
        initialActivityVersion={activityVersion}
        archivedDoneTasks={[]}
        archivedEpics={[]}
        projectActors={[]}
        epics={[]}
        collaborators={[person]}
      />
    );
  });
}

function persistResponse(version: string | null): Response {
  return new Response("{}", {
    status: 200,
    headers: version ? { "x-nexusdash-project-version": version } : undefined,
  });
}

async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("an acknowledged keyboard move is not applied twice after a typed reorder lands first", async () => {
  const fetchMock = vi.fn(async () => persistResponse(null));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
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
      capture.grid.onDragEnd(dropResult());
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

test("a newer authoritative remote order settles the acknowledgement without re-deriving the move", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:01.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The remote layout is newer than the write: it already contains the
    // committed move plus a later change, and parks the submitted task last.
    await act(async () => {
      expect(dispatchReorderEvent(["c", "b", "a"])).toBe(true);
    });
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The newer authoritative order is respected verbatim; nothing is
    // re-derived locally and no extra request is sent.
    expect(backlogOrder()).toEqual(["c", "b", "a"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a stale remote order delivered after acceptance does not override the committed write", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:05.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The event predates the write (older version) and arrives late: its
    // layout never included the committed move.
    await act(async () => {
      expect(
        dispatchReorderEvent(["b", "c", "a"], "2026-10-12T00:00:02.000Z")
      ).toBe(true);
    });
    expect(backlogOrder()).toEqual(["b", "c", "a"]);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The committed write is newer than the stale layout, so the settle
    // restores the stored order the write committed.
    expect(backlogOrder()).toEqual(["b", "a", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a remote insertion between acceptance and settle keeps the committed order", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:01.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A newer task lands at the top of the column while the drop settles. The
    // created event patches one task position; it does not carry the board
    // order, so it must not outrank the acknowledged write.
    await act(async () => {
      expect(
        dispatchCreatedEvent(
          {
            id: "d",
            reference: "ND-9",
            title: "d",
            labelsJson: null,
            label: null,
            description: null,
            deadlineDate: null,
            commentCount: 0,
            epic: null,
            assignee: null,
            createdAt: "2026-10-12T00:00:00Z",
            updatedAt: "2026-10-12T00:00:00Z",
            blockedFollowUps: [],
            status: "Backlog",
            position: -1,
            archivedAt: null,
            relatedTasks: [],
            attachments: [],
          },
          "2026-10-12T00:00:03.000Z"
        )
      ).toBe(true);
    });
    expect(backlogOrder()).toEqual(["d", "a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The settled board matches the stored order: the committed move (b before
    // a) is preserved and the insertion stays where it landed.
    expect(backlogOrder()).toEqual(["d", "b", "a", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a partial task event after acceptance does not cancel the committed keyboard move", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:01.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    await flushAsync();

    // A rename lands at a newer version but patches only C: a task delta says
    // nothing about the whole-board order the write committed, so it must not
    // stand in for an authoritative layout.
    await act(async () => {
      expect(
        dispatchUpdatedEvent(
          {
            ...makeTasks(["a", "b", "c"])[2],
            title: "C renamed",
            label: null,
            labelsJson: null,
          },
          "2026-10-12T00:00:02.000Z"
        )
      ).toBe(true);
    });

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The committed move is preserved and the rename stays in place.
    expect(backlogOrder()).toEqual(["b", "a", "c"]);
    expect(
      capture.grid.columns.Backlog.find((task: KanbanTask) => task.id === "c")
        .title
    ).toBe("C renamed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a parent-prop refetch newer than the acknowledged write is respected at settle", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:01.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The parent re-renders with fresh server tasks whose activity version is
    // newer than the acknowledged write; the layout already includes the
    // committed move plus a later change.
    await renderBoard(
      root,
      makeTasks(["c", "b", "a"]),
      "2026-10-12T00:00:03.000Z"
    );
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The newer authoritative layout is kept verbatim; the settle neither
    // re-derives the intent nor sends another request.
    expect(backlogOrder()).toEqual(["c", "b", "a"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a stale parent-prop refetch does not override the committed write at settle", async () => {
  const fetchMock = vi.fn(async () => persistResponse("2026-10-12T00:00:05.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The refreshed props predate the acknowledged write (older version):
    // their layout never included the committed move.
    await renderBoard(
      root,
      makeTasks(["c", "b", "a"]),
      "2026-10-12T00:00:02.000Z"
    );
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });

    // The committed write outranks the stale layout, so the settle restores
    // the stored order the write committed.
    expect(backlogOrder()).toEqual(["b", "a", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

test("a write acknowledged after the drop settled reconciles against its actual version", async () => {
  let resolvePersist!: (response: Response) => void;
  const pendingResponse = new Promise<Response>((resolve) => {
    resolvePersist = resolve;
  });
  const fetchMock = vi.fn(() => pendingResponse);
  vi.stubGlobal("fetch", fetchMock);
  const root = createRoot(document.createElement("div"));
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A refetch already in progress lands the collaborator's order before the
    // write commits; the write's version is still unknown, so the newer
    // full-order layout is respected at settle.
    await renderBoard(
      root,
      makeTasks(["c", "b", "a"]),
      "2026-10-12T00:00:02.000Z"
    );
    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    // The held request then commits after the remote layout and reports its
    // version: the write is the newest authority, so the board converges to
    // its stored order without another request.
    await act(async () => {
      resolvePersist(persistResponse("2026-10-12T00:00:03.000Z"));
    });
    await flushAsync();
    expect(backlogOrder()).toEqual(["b", "a", "c"]);
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
  const container = document.createElement("div");
  const root = createRoot(container);
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    await flushAsync();
    expect(backlogOrder()).toEqual(["a", "b", "c"]);
    expect(container.textContent).toContain("Could not save task movement");

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
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
  const container = document.createElement("div");
  const root = createRoot(container);
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The drop settles while the early request is still in flight.
    await act(async () => {
      capture.grid.onDragEnd(dropResult());
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

test("a late persist failure after a newer remote order keeps the authoritative order", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectPersist: (error: Error) => void = () => {};
  const pendingResponse = new Promise<Response>((_resolve, reject) => {
    rejectPersist = reject;
  });
  const fetchMock = vi.fn(() => pendingResponse);
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  const root = createRoot(container);
  await renderBoard(root, makeTasks(["a", "b", "c"]));
  try {
    await act(async () => {
      capture.grid.onKeyboardDropIntent(source, destination);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A newer authoritative layout arrives while the write is in flight.
    await act(async () => {
      expect(dispatchReorderEvent(["c", "b", "a"])).toBe(true);
    });
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    await act(async () => {
      capture.grid.onDragEnd(dropResult());
    });
    expect(backlogOrder()).toEqual(["c", "b", "a"]);

    // The write then fails: reverting to the captured columns would replace
    // the authoritative layout with an order the database never had, so the
    // board keeps the remote order and only surfaces the error.
    await act(async () => {
      rejectPersist(new Error("network down"));
    });
    await flushAsync();
    expect(backlogOrder()).toEqual(["c", "b", "a"]);
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
