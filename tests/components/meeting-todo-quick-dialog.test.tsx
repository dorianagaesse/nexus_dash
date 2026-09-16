// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  clampMeetingTodoDialogPosition,
  MeetingTodoQuickDialog,
  PANEL_POSITION_STORAGE_KEY,
  readStoredMeetingTodoDialogPosition,
} from "@/components/meeting-todos/meeting-todo-quick-dialog";
import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ACTOR_USER_ID = "user-current";

function humanActor(
  id: string,
  displayName: string,
  status: MeetingTodoActorSummary["status"] = "active"
): MeetingTodoActorSummary {
  return {
    kind: "human",
    id,
    displayName,
    usernameTag: null,
    avatarSeed: null,
    status,
    isAssignable: status === "active",
  };
}

const ownActor = humanActor(ACTOR_USER_ID, "Dorian");

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
      assignee: ownActor,
    },
    {
      id: "todo-complete",
      content: "Review the original quick panel",
      completedAt: "2026-07-11T10:00:00.000Z",
      position: 1,
      assignee: ownActor,
    },
  ],
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z",
};

const MIXED_ASSIGNMENT_NOTE: ProjectMeetingNotePanelNote = {
  ...OPEN_NOTE,
  id: "meeting-2",
  title: "Assignment review",
  scheduledAt: "2026-07-19T09:00:00.000Z",
  actions: [
    {
      id: "todo-mine",
      content: "My open follow-up",
      completedAt: null,
      position: 0,
      assignee: ownActor,
    },
    {
      id: "todo-other-human",
      content: "Someone else's follow-up",
      completedAt: null,
      position: 1,
      assignee: humanActor("user-other", "Camille"),
    },
    {
      id: "todo-participant",
      content: "External participant follow-up",
      completedAt: null,
      position: 2,
      assignee: {
        kind: "participant",
        id: "Guest Reviewer",
        displayName: "Guest Reviewer",
        usernameTag: null,
        avatarSeed: null,
        status: "active",
        isAssignable: true,
      },
    },
    {
      id: "todo-unassigned",
      content: "Unclaimed follow-up",
      completedAt: null,
      position: 3,
    },
    {
      id: "todo-mine-completed",
      content: "My finished follow-up",
      completedAt: "2026-07-20T08:00:00.000Z",
      position: 4,
      assignee: ownActor,
    },
    {
      id: "todo-other-completed",
      content: "Someone else's finished follow-up",
      completedAt: "2026-07-20T09:00:00.000Z",
      position: 5,
      assignee: humanActor("user-other", "Camille"),
    },
  ],
};

let roots: Root[] = [];
let containers: HTMLElement[] = [];

async function cleanupPanels() {
  for (const root of roots) {
    await act(async () => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  roots = [];
  containers = [];
  document.body.innerHTML = "";
}

function renderPanel({
  canEdit = true,
  notes = [OPEN_NOTE],
  currentActorUserId = ACTOR_USER_ID,
  onOpenMeeting = vi.fn(),
  onSetCompleted = vi.fn(),
}: {
  canEdit?: boolean;
  notes?: ProjectMeetingNotePanelNote[];
  currentActorUserId?: string;
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
        notes={notes}
        canEdit={canEdit}
        currentActorUserId={currentActorUserId}
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
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.getAttribute("aria-label") === name);
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

beforeEach(async () => {
  await cleanupPanels();
  window.localStorage.clear();
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
  await cleanupPanels();
  window.localStorage.clear();
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
    expect(dialog?.textContent).not.toContain(
      "Project follow-ups from meeting notes"
    );
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

  test("clamps movement to the viewport so the panel can clear project content", () => {
    const common = {
      currentPosition: { left: 100, top: 100 },
      dialogRect: { left: 500, right: 900, top: 200, bottom: 600 },
      viewportWidth: 1280,
      viewportHeight: 900,
    };

    expect(
      clampMeetingTodoDialogPosition({
        ...common,
        desiredPosition: { left: 900, top: 900 },
      })
    ).toEqual({ left: 464, top: 384 });
    expect(
      clampMeetingTodoDialogPosition({
        ...common,
        desiredPosition: { left: -900, top: -900 },
      })
    ).toEqual({ left: -384, top: -84 });
    expect(
      clampMeetingTodoDialogPosition({
        ...common,
        desiredPosition: { left: 200, top: 48 },
      })
    ).toEqual({ left: 200, top: 48 });
  });

  test("reads only finite stored panel positions", () => {
    expect(readStoredMeetingTodoDialogPosition()).toBeNull();

    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({ left: 420, top: 96 })
    );
    expect(readStoredMeetingTodoDialogPosition()).toEqual({
      left: 420,
      top: 96,
    });

    window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, "not-json");
    expect(readStoredMeetingTodoDialogPosition()).toBeNull();

    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({ left: "far", top: 96 })
    );
    expect(readStoredMeetingTodoDialogPosition()).toBeNull();
  });

  test("persists a movement and restores the saved panel position", async () => {
    renderPanel();
    await openTodosDialog();
    const defaultTransform = document.querySelector<HTMLElement>(
      '[role="dialog"]'
    )?.style.transform;
    expect(window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY)).toBeNull();

    await act(async () => {
      getButton("Move meeting todos panel with arrow keys").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(
      JSON.parse(window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY) ?? "null")
    ).toMatchObject({ left: expect.any(Number), top: expect.any(Number) });

    await cleanupPanels();

    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({ left: 420, top: 96 })
    );

    renderPanel();
    await openTodosDialog();
    const restoredDialog = document.querySelector<HTMLElement>('[role="dialog"]');

    expect(restoredDialog?.style.transform).not.toBe(defaultTransform);
    expect(restoredDialog?.style.getPropertyValue("--meeting-todo-position-x")).toBe(
      "420px"
    );
    expect(restoredDialog?.style.getPropertyValue("--meeting-todo-position-y")).toBe(
      "96px"
    );
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

    const movedTransform = dialog?.style.transform;
    await act(async () => {
      getButton("Close meeting todos").click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await openTodosDialog();

    const reopenedTransform = document.querySelector<HTMLElement>(
      '[role="dialog"]'
    )?.style.transform;
    expect(reopenedTransform).not.toBe(initialTransform);
    expect(reopenedTransform).not.toBe(
      "translate(calc(-50% + 0px), calc(-50% + 0px))"
    );
    expect(movedTransform).not.toBe(initialTransform);
  });

  test("shows only todos assigned to the current user", async () => {
    renderPanel({ notes: [MIXED_ASSIGNMENT_NOTE] });

    const trigger = getButton("Todos, 1 open");
    expect(trigger.textContent).toContain("Todos");
    await act(async () => {
      trigger.click();
      await Promise.resolve();
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("My open follow-up");
    expect(dialog?.textContent).toContain("My finished follow-up");
    expect(dialog?.textContent).not.toContain("Someone else's follow-up");
    expect(dialog?.textContent).not.toContain(
      "External participant follow-up"
    );
    expect(dialog?.textContent).not.toContain("Unclaimed follow-up");
    expect(dialog?.textContent).not.toContain(
      "Someone else's finished follow-up"
    );
  });

  test("renders no trigger or dialog when the current user has no assigned todos", () => {
    renderPanel({
      notes: [MIXED_ASSIGNMENT_NOTE],
      currentActorUserId: "user-without-todos",
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.getAttribute("aria-label")?.startsWith("Todos,")
      )
    ).toBe(false);
  });
});
