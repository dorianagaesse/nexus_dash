// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerRefreshMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const setIsExpandedMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const projectSectionExpandedMock = vi.hoisted(() => ({
  isExpanded: false,
  setIsExpanded: setIsExpandedMock,
}));

let capturedOnDragEnd: ((result: unknown) => Promise<void>) | undefined;
let capturedOnDragStart: (() => void) | undefined;

vi.mock("@hello-pangea/dnd", async () => {
  const ReactModule = await import("react");

  return {
    DragDropContext: ({
      children,
      onDragEnd,
      onDragStart,
    }: {
      children: React.ReactNode;
      onDragEnd?: (result: unknown) => Promise<void>;
      onDragStart?: () => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      capturedOnDragStart = onDragStart;
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
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
          droppableProps: {
            "data-test-droppable": droppableId,
          },
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

vi.mock("@/components/toast-provider", () => ({
  useToast: () => ({
    pushToast: pushToastMock,
  }),
}));

vi.mock("@/lib/hooks/use-project-section-expanded", () => ({
  useProjectSectionExpanded: () => projectSectionExpandedMock,
}));

import { ProjectRoadmapPanel } from "@/components/project-roadmap-panel";
import {
  PROJECT_ACTIVITY_ACK_EVENT,
  PROJECT_ACTIVITY_MUTATION_EVENT,
} from "@/lib/project-activity-client";
import { PROJECT_ACTIVITY_VERSION_HEADER } from "@/lib/project-activity-version";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function installMatchMediaMock(matches = true) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

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

describe("project-roadmap-panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    installMatchMediaMock();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    projectSectionExpandedMock.isExpanded = false;
    fetchMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("expands the section before opening the create event flow", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [],
      })
    );

    const newEventButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New event")
    );

    expect(newEventButton).not.toBeUndefined();

    await act(async () => {
      newEventButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setIsExpandedMock).toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("renders milestone lanes with grouped event content when expanded", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: false,
        phases: [
          {
            id: "phase-1",
            title: "Private beta",
            description: "Open the first customer wave.",
            targetDate: "2026-05-02",
            status: "active",
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
            events: [
              {
                id: "event-1",
                phaseId: "phase-1",
                title: "Invite wave one",
                description: "Invite the first five testers.",
                targetDate: "2026-05-02",
                status: "active",
                position: 0,
                createdAt: "2026-04-23T08:00:00.000Z",
                updatedAt: "2026-04-23T08:00:00.000Z",
              },
            ],
          },
        ],
      })
    );

    expect(container.textContent).toContain("Roadmap");
    expect(container.textContent).toContain("Milestone 1");
    expect(container.textContent).toContain("Invite wave one");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("1 event");
    expect(
      container.querySelector("[data-roadmap-event-card='event-1']")?.textContent
    ).not.toContain("Event 1");

    await act(async () => {
      root.unmount();
    });
  });

  test("opens event detail view from the view button", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();
    const fullDescription =
      "A much longer roadmap event note that should remain available in the dedicated detail view even when the card preview is compact.";

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [
          {
            id: "phase-1",
            title: "Private beta",
            description: "Open the first customer wave.",
            targetDate: "2026-05-02",
            status: "active",
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
            events: [
              {
                id: "event-1",
                phaseId: "phase-1",
                title: "Invite wave one",
                description: fullDescription,
                targetDate: "2026-05-02",
                status: "active",
                position: 0,
                createdAt: "2026-04-23T08:00:00.000Z",
                updatedAt: "2026-04-23T08:00:00.000Z",
              },
            ],
          },
        ],
      })
    );

    const viewButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("View")
    );

    expect(viewButton).not.toBeUndefined();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const detailDialog = document.body.querySelector("[role='dialog']");
    expect(detailDialog?.textContent).toContain("Invite wave one");
    expect(detailDialog?.textContent).toContain(fullDescription);
    expect(detailDialog?.textContent).toContain("Milestone 1");

    await act(async () => {
      root.unmount();
    });
  });

  test("cycles event status when the status badge is clicked", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        event: {
          id: "event-1",
          phaseId: "phase-1",
          title: "Invite wave one",
          description: "Invite the first five testers.",
          targetDate: "2026-05-02",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
        },
        phase: {
          id: "phase-1",
          title: "Private beta",
          description: "Open the first customer wave.",
          targetDate: "2026-05-02",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-04-23T08:00:00.000Z",
          events: [
            {
              id: "event-1",
              phaseId: "phase-1",
              title: "Invite wave one",
              description: "Invite the first five testers.",
              targetDate: "2026-05-02",
              status: "active",
              position: 0,
              createdAt: "2026-04-23T08:00:00.000Z",
              updatedAt: "2026-04-23T08:00:00.000Z",
            },
          ],
        },
      }),
    });

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [
          {
            id: "phase-1",
            title: "Private beta",
            description: "Open the first customer wave.",
            targetDate: "2026-05-02",
            status: "planned",
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
            events: [
              {
                id: "event-1",
                phaseId: "phase-1",
                title: "Invite wave one",
                description: "Invite the first five testers.",
                targetDate: "2026-05-02",
                status: "planned",
                position: 0,
                createdAt: "2026-04-23T08:00:00.000Z",
                updatedAt: "2026-04-23T08:00:00.000Z",
              },
            ],
          },
        ],
      })
    );

    const statusButton = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes("Planned") &&
        button.getAttribute("aria-label")?.includes("Change status")
    );

    expect(statusButton).not.toBeUndefined();

    await act(async () => {
      statusButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/events/event-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "active",
      }),
    });
    expect(container.textContent).toContain("Active");
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Invite wave one marked as active.",
      variant: "success",
    });

    await act(async () => {
      root.unmount();
    });
  });

  test("provides an opt-in question-mark help affordance that toggles the roadmap guide (ND-143 AC1)", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [],
      })
    );

    const helpButton = container.querySelector("button[aria-label='Roadmap help']") as HTMLButtonElement;
    expect(helpButton).not.toBeNull();
    expect(helpButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();

    // Click to open help popover
    await act(async () => {
      helpButton.click();
    });

    expect(helpButton.getAttribute("aria-expanded")).toBe("true");
    const popover = document.querySelector("[data-section-help-popover='true']");
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("Roadmap guide");
    expect(popover?.textContent).toContain("What is a milestone?");
    expect(popover?.textContent).toContain("How phases & events relate");
    expect(popover?.textContent).toContain("What good inputs look like");

    // Close help popover
    await act(async () => {
      helpButton.click();
    });
    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("empty state explains what a milestone is, how phases and events relate, and what good inputs look like (ND-143 AC2)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [],
      })
    );

    const emptyContainer = container.querySelector("[data-roadmap-empty-container='true']");
    expect(emptyContainer).not.toBeNull();
    expect(emptyContainer?.textContent).toContain("No roadmap yet");
    expect(emptyContainer?.textContent).toContain("What is a milestone?");
    expect(emptyContainer?.textContent).toContain("Phases & events");
    expect(emptyContainer?.textContent).toContain("Good input examples");
    expect(emptyContainer?.textContent).toContain("Create the first event");

    await act(async () => {
      root.unmount();
    });
  });

  test("persists event move across milestones, updates lane counts, and suppresses racing reloads without unlinking (ND-402)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const activityMutations: string[] = [];
    const activityAcks: string[] = [];
    const mutationHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ phase: string }>;
      activityMutations.push(customEvent.detail.phase);
    };
    const ackHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ version: string }>;
      activityAcks.push(customEvent.detail.version);
    };

    window.addEventListener(PROJECT_ACTIVITY_MUTATION_EVENT, mutationHandler);
    window.addEventListener(PROJECT_ACTIVITY_ACK_EVENT, ackHandler);

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: "Phase one description",
        targetDate: "2026-05-01",
        status: "active" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: "First task",
            targetDate: "2026-05-01",
            status: "active" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-3",
            phaseId: "phase-1",
            title: "Task 3",
            description: "Third task",
            targetDate: "2026-05-01",
            status: "active" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: "Phase two description",
        targetDate: "2026-06-01",
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-2",
            phaseId: "phase-2",
            title: "Task 2",
            description: "Second task",
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, activityVersion: 42 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:00.000Z",
        },
      })
    );

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    expect(container.querySelector("[data-roadmap-phase-id='phase-1']")?.textContent).toContain("2 events");
    expect(container.querySelector("[data-roadmap-phase-id='phase-2']")?.textContent).toContain("1 event");

    // Simulate drag and drop of event-1 from phase-1 into phase-2
    expect(capturedOnDragEnd).toBeDefined();
    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-1",
        source: { droppableId: "phase-1", index: 0 },
        destination: { droppableId: "phase-2", index: 1 },
      });
    });

    // Verify API call used fetchProjectActivityMutation contract
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/events/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: "event-1",
        targetPhaseId: "phase-2",
        targetIndex: 1,
      }),
    });

    // Verify activity mutation start/finish and activity acknowledgement
    expect(activityMutations).toEqual(["start", "finish"]);
    expect(activityAcks).toEqual(["2026-04-20T00:00:00.000Z"]);

    // Verify racing router.refresh was NOT triggered
    expect(routerRefreshMock).not.toHaveBeenCalled();

    // Verify optimistic DOM updates: event counts and positions
    const phase1Section = container.querySelector("[data-roadmap-phase-id='phase-1']");
    const phase2Section = container.querySelector("[data-roadmap-phase-id='phase-2']");
    expect(phase1Section?.textContent).toContain("1 event");
    expect(phase1Section?.querySelector("[data-roadmap-event-card='event-3']")).not.toBeNull();
    expect(phase2Section?.textContent).toContain("2 events");
    expect(phase2Section?.querySelector("[data-roadmap-event-card='event-1']")).not.toBeNull();
    expect(phase2Section?.querySelector("[data-roadmap-event-card='event-2']")).not.toBeNull();

    // Verify post-refresh prop reconciliation preserves association
    const refreshedPhases = [
      {
        ...initialPhases[0],
        events: [initialPhases[0].events[1]],
      },
      {
        ...initialPhases[1],
        events: [
          initialPhases[1].events[0],
          { ...initialPhases[0].events[0], phaseId: "phase-2", position: 1 },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: refreshedPhases,
      })
    );

    const refreshedPhase2 = container.querySelector("[data-roadmap-phase-id='phase-2']");
    expect(refreshedPhase2?.textContent).toContain("2 events");
    expect(refreshedPhase2?.querySelector("[data-roadmap-event-card='event-1']")).not.toBeNull();

    window.removeEventListener(PROJECT_ACTIVITY_MUTATION_EVENT, mutationHandler);
    window.removeEventListener(PROJECT_ACTIVITY_ACK_EVENT, ackHandler);

    await act(async () => {
      root.unmount();
    });
  });

  test("reverts optimistic state and displays error toast when move mutation fails (ND-402)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: "Phase one description",
        targetDate: "2026-05-01",
        status: "active" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: "First task",
            targetDate: "2026-05-01",
            status: "active" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: "Phase two description",
        targetDate: "2026-06-01",
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-2",
            phaseId: "phase-2",
            title: "Task 2",
            description: "Second task",
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "roadmap-event-move-failed" }), {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      })
    );

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-1",
        source: { droppableId: "phase-1", index: 0 },
        destination: { droppableId: "phase-2", index: 1 },
      });
    });

    // Verify error toast was shown with the failure message
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Could not save roadmap order. Please retry.",
      variant: "error",
    });

    // Verify rollback: event-1 is restored to phase-1 and event counts are intact
    const phase1Section = container.querySelector("[data-roadmap-phase-id='phase-1']");
    const phase2Section = container.querySelector("[data-roadmap-phase-id='phase-2']");
    expect(phase1Section?.textContent).toContain("1 event");
    expect(phase1Section?.querySelector("[data-roadmap-event-card='event-1']")).not.toBeNull();
    expect(phase2Section?.textContent).toContain("1 event");
    expect(phase2Section?.querySelector("[data-roadmap-event-card='event-2']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("creates new milestone and moves event when dropped onto new milestone drop lane without racing reload (ND-402)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: "Phase one description",
        targetDate: "2026-05-01",
        status: "active" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: "First task",
            targetDate: "2026-05-01",
            status: "active" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: "Second task",
            targetDate: "2026-05-15",
            status: "planned" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    // Response 1: Create Phase
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          phase: {
            id: "phase-2",
            title: "Milestone 2",
            description: "",
            targetDate: "2026-05-15",
            status: "planned",
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
            events: [],
          },
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:00.000Z",
          },
        }
      )
    );

    // Response 2: Move Event
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, activityVersion: 11 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:01.000Z",
        },
      })
    );

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-2",
        source: { droppableId: "phase-1", index: 1 },
        destination: { droppableId: "__roadmap-drop-new-milestone__", index: 0 },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Milestone 2",
        description: "",
        targetDate: "2026-05-15",
        status: "planned",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/events/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: "event-2",
        targetPhaseId: "phase-2",
        targetIndex: 0,
      }),
    });

    // router.refresh was NOT called
    expect(routerRefreshMock).not.toHaveBeenCalled();

    // Milestone 1 has 1 event remaining, and Milestone 2 has 1 event
    const phase1Section = container.querySelector("[data-roadmap-phase-id='phase-1']");
    const phase2Section = container.querySelector("[data-roadmap-phase-id='phase-2']");
    expect(phase1Section?.textContent).toContain("1 event");
    expect(phase2Section?.textContent).toContain("1 event");
    expect(phase2Section?.querySelector("[data-roadmap-event-card='event-2']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
