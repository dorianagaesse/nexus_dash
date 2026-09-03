// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@hello-pangea/dnd", async () => {
  const ReactModule = await import("react");

  return {
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    Droppable: ({
      children,
      droppableId,
    }: {
      children: (provided: unknown, snapshot: unknown) => React.ReactNode;
      droppableId: string;
    }) =>
      children(
        {
          innerRef: () => undefined,
          droppableProps: { "data-test-droppable": droppableId },
          placeholder: null,
        },
        { isDraggingOver: false }
      ),
    Draggable: ({
      children,
      draggableId,
    }: {
      children: (provided: unknown, snapshot: unknown) => React.ReactNode;
      draggableId: string;
    }) =>
      children(
        {
          innerRef: () => undefined,
          draggableProps: {
            "data-test-draggable": draggableId,
            style: {},
          },
          dragHandleProps: {},
        },
        { isDragging: false }
      ),
  };
});

import { KanbanColumnsGrid } from "@/components/kanban/kanban-columns-grid";
import type { KanbanTask } from "@/components/kanban-board-types";
import { createEmptyColumns } from "@/components/kanban-board-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTask(id: string, status: KanbanTask["status"]): KanbanTask {
  const actor = {
    id: "user-1",
    displayName: "Project owner",
    usernameTag: "owner#0001",
    avatarSeed: "owner",
  };

  return {
    id,
    reference: `ND-${id}`,
    title: `Task ${id}`,
    description: `<p>Description for ${id}</p>`,
    deadlineDate: null,
    commentCount: 0,
    labels: [],
    blockedFollowUps: [],
    status,
    position: 0,
    archivedAt: null,
    attachments: [],
    relatedTasks: [],
    epic: null,
    assignee: null,
    createdBy: actor,
    updatedBy: actor,
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T08:00:00.000Z",
  };
}

function createRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

async function renderGrid(
  root: Root,
  options: {
    canEdit?: boolean;
    onSelectTask?: (task: KanbanTask) => void;
  } = {}
) {
  const columns = createEmptyColumns<KanbanTask>();
  columns.Backlog = [createTask("1", "Backlog"), createTask("2", "Backlog")];
  columns["In Progress"] = [createTask("3", "In Progress")];
  columns.Done = [createTask("4", "Done")];
  const archivedTask = {
    ...createTask("5", "Done"),
    archivedAt: "2026-08-29T09:00:00.000Z",
  };

  await act(async () => {
    root.render(
      <KanbanColumnsGrid
        canEdit={options.canEdit ?? true}
        columns={columns}
        archivedDoneTasks={[archivedTask]}
        mentionUsers={[]}
        highlightedTaskIds={new Set()}
        onDragEnd={vi.fn()}
        onSelectTask={options.onSelectTask ?? vi.fn()}
        onEditTask={vi.fn()}
        onTaskHoverChange={vi.fn()}
      />
    );
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("KanbanColumnsGrid bounded lanes", () => {
  test("keeps lane metadata and archive controls outside named task scrollers", async () => {
    const { container, root } = createRenderer();
    await renderGrid(root);

    const lanes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-kanban-lane]")
    );
    const scrollers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-kanban-lane-scroll]")
    );

    expect(lanes).toHaveLength(4);
    expect(scrollers).toHaveLength(4);
    lanes.forEach((lane) => {
      expect(lane.className).toContain("h-[clamp(20rem,64dvh,42rem)]");
      expect(lane.className).toContain("flex-col");
    });
    lanes.slice(1).forEach((lane) => {
      expect(lane.className).toContain("xl:flex");
    });
    scrollers.forEach((scroller) => {
      expect(scroller.getAttribute("role")).toBe("region");
      expect(scroller.tabIndex).toBe(0);
      expect(scroller.className).toContain("overflow-y-auto");
      expect(scroller.className).toContain("overscroll-y-contain");
      expect(scroller.className).toContain("[scrollbar-gutter:stable]");
      expect(scroller.getAttribute("aria-labelledby")).not.toBeNull();
    });

    const doneScroller = container.querySelector<HTMLElement>(
      '[data-kanban-lane-scroll="Done"]'
    );
    const archiveSummary = Array.from(
      container.querySelectorAll("summary")
    ).find((summary) => summary.textContent?.includes("Archive (1)"));

    expect(archiveSummary).toBeDefined();
    expect(doneScroller?.contains(archiveSummary ?? null)).toBe(false);

    await act(async () => root.unmount());
  });

  test("preserves independent native scroll positions while switching mobile lanes", async () => {
    const { container, root } = createRenderer();
    await renderGrid(root);

    const backlogScroller = container.querySelector<HTMLElement>(
      '[data-kanban-lane-scroll="Backlog"]'
    );
    const progressScroller = container.querySelector<HTMLElement>(
      '[data-kanban-lane-scroll="In Progress"]'
    );
    expect(backlogScroller).not.toBeNull();
    expect(progressScroller).not.toBeNull();

    if (!backlogScroller || !progressScroller) {
      return;
    }

    backlogScroller.scrollTop = 96;
    progressScroller.scrollTop = 24;

    const progressButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="In Progress,"]'
    );
    await act(async () => progressButton?.click());

    const backlogLane = container.querySelector<HTMLElement>(
      '[data-kanban-lane="Backlog"]'
    );
    const progressLane = container.querySelector<HTMLElement>(
      '[data-kanban-lane="In Progress"]'
    );
    expect(backlogLane?.classList.contains("hidden")).toBe(true);
    expect(progressLane?.classList.contains("hidden")).toBe(false);

    const backlogButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Backlog,"]'
    );
    await act(async () => backlogButton?.click());

    expect(container.querySelector('[data-kanban-lane-scroll="Backlog"]')).toBe(
      backlogScroller
    );
    expect(backlogScroller.scrollTop).toBe(96);
    expect(progressScroller.scrollTop).toBe(24);

    await act(async () => root.unmount());
  });

  test("gives the archived Done scroller the lane scroller focus treatment", async () => {
    const { container, root } = createRenderer();
    await renderGrid(root);

    const archiveRegion = container.querySelector<HTMLElement>(
      '[aria-label="Archived Done tasks"]'
    );
    expect(archiveRegion).not.toBeNull();
    expect(archiveRegion?.getAttribute("role")).toBe("region");
    expect(archiveRegion?.tabIndex).toBe(0);
    [
      "overflow-y-auto",
      "overscroll-y-contain",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-inset",
      "focus-visible:ring-ring",
    ].forEach((token) => {
      expect(archiveRegion?.className).toContain(token);
    });

    await act(async () => root.unmount());
  });

  test("keeps task cards keyboard-operable when editing is disabled", async () => {
    const { container, root } = createRenderer();
    const onSelectTask = vi.fn();
    await renderGrid(root, { canEdit: false, onSelectTask });

    const card = container.querySelector<HTMLElement>(
      '[data-kanban-task-id="1"]'
    );
    expect(card).not.toBeNull();
    expect(card?.getAttribute("role")).toBe("button");
    expect(card?.tabIndex).toBe(0);

    await act(async () => {
      card?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1", title: "Task 1" })
    );

    onSelectTask.mockClear();
    await act(async () => {
      card?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" })
    );

    onSelectTask.mockClear();
    await act(async () => {
      card?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(onSelectTask).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
