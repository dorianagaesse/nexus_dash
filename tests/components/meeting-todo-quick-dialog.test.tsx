// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  clampMeetingTodoDialogPosition,
  MeetingTodoQuickDialog,
} from "@/components/meeting-todos/meeting-todo-quick-dialog";
import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const OPEN_NOTE: ProjectMeetingNotePanelNote = {
  id: "meeting-1",
  projectId: "project-1",
  title: "Delivery review",
  scheduledAt: "2026-07-10T09:00:00.000Z",
  participants: [],
  labels: [],
  status: "actions_in_progress",
  inputNotes: "",
  outputNotes: "",
  actions: [
    {
      id: "todo-open",
      content: "Choose the movable todo entry",
      completedAt: null,
      position: 0,
    },
    {
      id: "todo-complete",
      content: "Review the original quick panel",
      completedAt: "2026-07-11T10:00:00.000Z",
      position: 1,
    },
  ],
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z",
};

let roots: Root[] = [];
let containers: HTMLElement[] = [];

function renderPanel({
  canEdit = true,
  onOpenMeeting = vi.fn(),
  onSetCompleted = vi.fn(),
}: {
  canEdit?: boolean;
  onOpenMeeting?: ReturnType<typeof vi.fn>;
  onSetCompleted?: ReturnType<typeof vi.fn>;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  act(() => {
    root.render(
      <MeetingTodoQuickDialog
        notes={[OPEN_NOTE]}
        canEdit={canEdit}
        referenceNowMs={new Date("2026-07-20T12:00:00.000Z").getTime()}
        pendingActionId={null}
        onOpenMeeting={onOpenMeeting}
        onSetCompleted={onSetCompleted}
      />
    );
  });

  return { onOpenMeeting, onSetCompleted };
}

function getButton(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === name
  );
  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

async function openTodosDialog() {
  const trigger = getButton("Todos, 1 open, 1 overdue");
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
  return trigger;
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  );
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(async () => {
  for (const root of roots) {
    await act(async () => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  roots = [];
  containers = [];
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("meeting todo quick dialog", () => {
  test("uses a compact desktop-only trigger and an accessible modeless panel", async () => {
    renderPanel();

    const trigger = getButton("Todos, 1 open, 1 overdue");
    expect(trigger.className).toContain("hidden");
    expect(trigger.className).toContain("lg:inline-flex");
    expect(trigger.textContent).toContain("Todos");

    trigger.focus();
    await openTodosDialog();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');

    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("false");
    expect(dialog?.textContent).toContain("Meeting todos");
    expect(dialog?.textContent).toContain("Choose the movable todo entry");
    expect(dialog?.textContent).toContain("Recently completed");
    expect(
      getButton("Move meeting todos panel with arrow keys").className
    ).toContain("h-11");
    expect(dialog?.textContent).not.toContain("Drag to move");

    const projectInput = document.createElement("input");
    projectInput.setAttribute("aria-label", "Project field");
    document.body.appendChild(projectInput);
    await act(async () => {
      projectInput.focus();
      projectInput.click();
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(projectInput);
    expect(document.querySelector<HTMLElement>('[role="dialog"]')).toBe(dialog);
    expect(document.querySelector<HTMLElement>(".fixed.inset-0")).toBeNull();

    await act(async () => {
      getButton("Close meeting todos").click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.activeElement).toBe(trigger);
  });

  test("keeps completion and source-meeting actions intact without stacking dialogs", async () => {
    const onOpenMeeting = vi.fn();
    const onSetCompleted = vi.fn();
    renderPanel({ onOpenMeeting, onSetCompleted });
    await openTodosDialog();

    await act(async () => {
      getButton("Complete todo: Choose the movable todo entry").click();
    });
    expect(onSetCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ id: "todo-open" }) }),
      true
    );

    const sourceButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
    ).find((button) => button.textContent?.includes("Choose the movable todo entry"));
    expect(sourceButton).toBeDefined();
    await act(async () => {
      sourceButton?.click();
      await Promise.resolve();
    });

    expect(onOpenMeeting).toHaveBeenCalledWith(OPEN_NOTE);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("renders viewer-safe read-only controls", async () => {
    renderPanel({ canEdit: false });
    await openTodosDialog();

    expect(document.body.textContent).toContain("View-only project");
    expect(
      document.querySelector(
        'button[aria-label="Complete todo: Choose the movable todo entry"]'
      )
    ).toBeNull();
  });

  test("clamps movement to the visible project and viewport intersection", () => {
    const common = {
      currentPosition: { x: 0, y: 0 },
      dialogRect: { left: 500, right: 900, top: 200, bottom: 600 },
      projectRect: { left: 256, right: 1280, top: 0, bottom: 1600 },
      viewportWidth: 1280,
      viewportHeight: 900,
    };

    expect(
      clampMeetingTodoDialogPosition({
        ...common,
        desiredPosition: { x: 900, y: 900 },
      })
    ).toEqual({ x: 364, y: 284 });
    expect(
      clampMeetingTodoDialogPosition({
        ...common,
        desiredPosition: { x: -900, y: -900 },
      })
    ).toEqual({ x: -228, y: -184 });
  });

  test("supports keyboard movement from the compact header control", async () => {
    renderPanel();
    await openTodosDialog();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const moveHandle = getButton("Move meeting todos panel with arrow keys");
    const initialTransform = dialog?.style.transform;

    await act(async () => {
      moveHandle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });

    expect(dialog?.style.transform).not.toBe(initialTransform);
    const liveRegion = document.querySelector<HTMLElement>('[role="status"]');
    const firstAnnouncement = liveRegion?.firstElementChild;
    expect(liveRegion?.textContent).toBe("Todos panel moved right.");

    await act(async () => {
      moveHandle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });

    expect(liveRegion?.textContent).toBe("Todos panel moved right.");
    expect(liveRegion?.firstElementChild).not.toBe(firstAnnouncement);
  });
});
