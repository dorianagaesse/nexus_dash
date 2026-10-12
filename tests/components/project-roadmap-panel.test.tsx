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

  test("preserves desktop connector branches when dragging and dropping in the same location", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: "",
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
            description: "",
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
        description: "",
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
            description: "",
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-3",
        title: "Milestone 3",
        description: "",
        targetDate: "2026-07-01",
        status: "planned" as const,
        position: 2,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-3a",
            phaseId: "phase-3",
            title: "Task 3A",
            description: "",
            targetDate: "2026-07-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-3b",
            phaseId: "phase-3",
            title: "Task 3B",
            description: "",
            targetDate: "2026-07-01",
            status: "planned" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    // Connector svgs between milestones
    const connectorSvgs = container.querySelectorAll("svg");
    expect(connectorSvgs.length).toBeGreaterThanOrEqual(2);

    // The connector leading into Milestone 3 (which has 2 events) must have 2 branch paths plus trunk/lead
    const toPhase3Svg = connectorSvgs[1];
    expect(toPhase3Svg).toBeDefined();
    const initialPaths = toPhase3Svg?.querySelectorAll("path") ?? [];
    // Must render fork connector with lead path + 2 separate event branches = 3 paths (never collapsed to single branch)
    expect(initialPaths.length).toBe(3);

    // Start dragging event-3b and drop in same position
    await act(async () => {
      capturedOnDragStart?.();
    });

    await act(async () => {
      await capturedOnDragEnd?.({
        draggableId: "event-3b",
        source: { droppableId: "phase-3", index: 1 },
        destination: { droppableId: "phase-3", index: 1 },
      });
    });

    // Connector paths for Milestone 3 must still have all fork branches (never collapsed to 1 single path)
    const postDropPaths = toPhase3Svg?.querySelectorAll("path") ?? [];
    expect(postDropPaths.length).toBe(3);

    await act(async () => {
      root.unmount();
    });
  });

  test("exposes an edit milestone action in edit mode and hides it in read-only mode", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Private beta",
        description: "Open the first customer wave.",
        targetDate: "2026-05-02",
        status: "active" as const,
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ];

    // Read-only mode
    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: false,
        phases,
      })
    );

    expect(container.querySelector("[data-roadmap-edit-milestone='phase-1']")).toBeNull();

    // Edit mode
    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );
    expect(editButton).not.toBeNull();
    expect(editButton?.getAttribute("aria-label")).toBe("Edit Private beta");

    await act(async () => {
      root.unmount();
    });
  });

function setInputValue(input: HTMLElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

  test("opens milestone edit dialog populated with current fields and cancels cleanly", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Private beta",
        description: "Open the first customer wave.",
        targetDate: "2026-05-02",
        status: "active" as const,
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Invite wave one",
            description: "First wave invitees.",
            targetDate: "2026-05-02",
            status: "active" as const,
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );
    expect(editButton).not.toBeNull();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Edit milestone");
    expect(dialog?.textContent).toContain("Milestone 1");

    const titleInput = document.body.querySelector<HTMLInputElement>(
      "#roadmap-milestone-title"
    );
    expect(titleInput?.value).toBe("Private beta");

    const descriptionInput = document.body.querySelector<HTMLTextAreaElement>(
      "#roadmap-milestone-description"
    );
    expect(descriptionInput?.value).toBe("Open the first customer wave.");

    const dateButton = document.body.querySelector(
      "#roadmap-milestone-target-date"
    );
    expect(dateButton?.textContent).toMatch(/2026/);
    expect(dateButton?.textContent).toMatch(/2/);

    // Click cancel
    const cancelButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((btn) => btn.textContent?.trim() === "Cancel");
    expect(cancelButton).toBeDefined();

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Dialog is closed
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    // Milestone remains unchanged
    expect(container.textContent).toContain("Private beta");
    expect(container.textContent).toContain("Invite wave one");

    await act(async () => {
      root.unmount();
    });
  });

  test("validates milestone title before saving", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Private beta",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const titleInput = document.body.querySelector<HTMLInputElement>(
      "#roadmap-milestone-title"
    );
    expect(titleInput).not.toBeNull();

    // Set title too short
    await act(async () => {
      if (titleInput) {
        setInputValue(titleInput, " ");
      }
    });

    const saveButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((btn) => btn.textContent?.includes("Save milestone"));
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog?.textContent).toContain("Title must be at least 2 characters.");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("saves milestone in place, preserves linked events and position, and displays toast", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Private beta",
        description: "Initial description",
        targetDate: "2026-05-02",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: null,
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        phase: {
          id: "phase-1",
          title: "Public Launch",
          description: "New updated launch description",
          targetDate: "2026-06-15",
          status: "active",
          position: 0,
          createdAt: "2026-04-23T08:00:00.000Z",
          updatedAt: "2026-06-15T08:00:00.000Z",
          events: [
            {
              id: "event-1",
              phaseId: "phase-1",
              title: "Task 1",
              description: null,
              targetDate: null,
              status: "planned" as const,
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
        phases,
      })
    );

    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const titleInput = document.body.querySelector<HTMLInputElement>(
      "#roadmap-milestone-title"
    );
    const descInput = document.body.querySelector<HTMLTextAreaElement>(
      "#roadmap-milestone-description"
    );

    await act(async () => {
      if (titleInput) {
        setInputValue(titleInput, "Public Launch");
      }
      if (descInput) {
        setInputValue(descInput, "New updated launch description");
      }
    });

    const saveButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((btn) => btn.textContent?.includes("Save milestone"));

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/roadmap/phases/phase-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Public Launch",
          description: "New updated launch description",
          targetDate: "2026-05-02",
          status: "planned",
        }),
      })
    );

    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Public Launch has been updated.",
      variant: "success",
    });

    // Dialog closed
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    // Rendered panel contains updated title and description, preserved event and position
    expect(container.textContent).toContain("Public Launch");
    expect(container.textContent).toContain("New updated launch description");
    expect(container.textContent).toContain("Task 1");
    expect(container.textContent).toContain("Milestone 2");

    await act(async () => {
      root.unmount();
    });
  });

  test("handles server error on milestone save without changing existing state", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Private beta",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "roadmap-phase-update-failed",
      }),
    });

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saveButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((btn) => btn.textContent?.includes("Save milestone"));

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog?.textContent).toContain("Could not update roadmap phase. Please retry.");
    expect(container.textContent).toContain("Private beta");

    await act(async () => {
      root.unmount();
    });
  });

  test("displays placeholder texts when milestone details are unset in edit mode and allows opening dialog from placeholders", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();
    const phases = [
      {
        id: "phase-1",
        title: "",
        description: null,
        targetDate: null,
        position: 0,
        status: "planned" as const,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        events: [],
      },
    ];

    // Read-only mode: placeholders should not be rendered
    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: false,
        phases,
      })
    );

    expect(container.textContent).not.toContain("No title yet");
    expect(container.textContent).not.toContain("No description yet");

    // Edit mode: placeholders should be visible and clickable
    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    const titlePlaceholder = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-phase-title='phase-1']"
    );
    const descPlaceholder = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-phase-description='phase-1']"
    );
    const editButton = container.querySelector<HTMLButtonElement>(
      "[data-roadmap-edit-milestone='phase-1']"
    );

    expect(titlePlaceholder).not.toBeNull();
    expect(titlePlaceholder?.textContent).toBe("No title yet");
    expect(descPlaceholder).not.toBeNull();
    expect(descPlaceholder?.textContent).toBe("No description yet");
    expect(editButton).not.toBeNull();

    // Clicking "No title yet" opens the edit dialog
    await act(async () => {
      titlePlaceholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    let dialog = document.body.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Edit milestone");

    // Close dialog
    const cancelButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((btn) => btn.textContent?.includes("Cancel"));
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Clicking "No description yet" opens the edit dialog
    await act(async () => {
      descPlaceholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    dialog = document.body.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Edit milestone");

    await act(async () => {
      root.unmount();
    });
  });

  test("creates milestone between adjacent milestones and moves event immediately without opening modal (ND-403, ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Alpha",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-15",
            status: "in_progress" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Beta",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-3",
            phaseId: "phase-2",
            title: "Task 3",
            description: null,
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    // Mock API calls:
    // 1. POST /api/projects/project-1/roadmap -> returns created phase
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          phase: {
            id: "phase-new",
            title: "Milestone 2",
            description: "",
            targetDate: "2026-05-15",
            status: "in_progress",
            position: 2,
            createdAt: "2026-04-21T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            events: [],
          },
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-21T00:00:01.000Z",
          },
        }
      )
    );

    // 2. POST /api/projects/project-1/roadmap/phases/reorder
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-21T00:00:02.000Z",
        },
      })
    );

    // 3. POST /api/projects/project-1/roadmap/events/move
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, activityVersion: 12 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-21T00:00:03.000Z",
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

    // Drop event-2 between Alpha (index 0) and Beta (index 1) -> insertIndex = 1
    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-2",
        source: { droppableId: "phase-1", index: 1 },
        destination: { droppableId: "__roadmap-drop-new-milestone-at-1__", index: 0 },
      });
    });

    // No modal dialog opened
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    // Verify API calls
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Milestone 2",
        description: "",
        targetDate: "2026-05-15",
        status: "in_progress",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/phases/reorder", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phaseIds: ["phase-1", "phase-new", "phase-2"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/events/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: "event-2",
        targetPhaseId: "phase-new",
        targetIndex: 0,
      }),
    });

    // Toast pushed
    expect(pushToastMock).toHaveBeenCalledWith({
      message: 'Milestone "Milestone 2" created with "Task 2".',
      variant: "success",
    });

    // Verify rendering order on the roadmap: Alpha -> Milestone 2 -> Beta
    const renderedPhaseTitles = Array.from(
      container.querySelectorAll("[data-roadmap-phase-id]")
    ).map((el) => el.getAttribute("data-roadmap-phase-id"));

    expect(renderedPhaseTitles).toEqual(["phase-1", "phase-new", "phase-2"]);
    expect(container.textContent).toContain("Task 2");

    await act(async () => {
      root.unmount();
    });
  });

  test("failed persistence when dropping event between milestones reverts optimistic milestone (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Alpha",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-15",
            status: "in_progress" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Beta",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-3",
            phaseId: "phase-2",
            title: "Task 3",
            description: null,
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    // Mock API failure on phase creation
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Could not create roadmap phase." }), {
        status: 500,
        headers: { "content-type": "application/json" },
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
        destination: { droppableId: "__roadmap-drop-new-milestone-at-1__", index: 0 },
      });
    });

    // Reverts to original phases: phase-1 has Task 1 and Task 2
    const phase1 = container.querySelector("[data-roadmap-phase-id='phase-1']");
    expect(phase1?.textContent).toContain("Task 1");
    expect(phase1?.textContent).toContain("Task 2");

    // Toast pushed
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error" })
    );

    // Refresh lock released
    expect(container.querySelector("[data-project-live-refresh-lock='true']")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("intermediate drop zone remains invisible with opacity-0 while dragging until hovered (ND-403)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    // Start dragging an event
    await act(async () => {
      capturedOnDragStart?.();
    });

    // The between-milestone dropzone element exists in the DOM for interaction
    const dropzone = container.querySelector("[data-roadmap-between-milestones-dropzone='1']");
    expect(dropzone).not.toBeNull();

    // It has opacity-0 when not dragged over (no default intrusive popup/text)
    expect(dropzone?.className).toContain("opacity-0");
    expect(dropzone?.textContent).not.toContain("Insert milestone");

    await act(async () => {
      root.unmount();
    });
  });

  test("reorders milestones directly when moving sole event of milestone 3 between milestones 1 and 2 without opening creation modal", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const phases = [
      {
        id: "phase-1",
        title: "Beta Launch",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-2",
            phaseId: "phase-2",
            title: "Task 2",
            description: null,
            targetDate: "2026-06-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-3",
        title: "Milestone 3",
        description: null,
        targetDate: null,
        status: "planned" as const,
        position: 2,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-3",
            phaseId: "phase-3",
            title: "Task 3",
            description: null,
            targetDate: "2026-07-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-21T00:00:02.000Z",
        },
      })
    );

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases,
      })
    );

    // Drop sole event of phase-3 into gap between phase-1 and phase-2 (insertIndex = 1)
    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-3",
        source: { droppableId: "phase-3", index: 0 },
        destination: { droppableId: "__roadmap-drop-new-milestone-at-1__", index: 0 },
      });
    });

    // No creation dialog should open
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    // Reorder API should be called with swapped order: phase-1, phase-3, phase-2
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/phases/reorder", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phaseIds: ["phase-1", "phase-3", "phase-2"],
      }),
    });

    // Toast pushed
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Milestone order updated.",
      variant: "success",
    });

    // Check rendered milestone positions: phase-1 -> phase-3 -> phase-2
    const renderedPhases = Array.from(
      container.querySelectorAll("[data-roadmap-phase-id]")
    ).map((el) => el.getAttribute("data-roadmap-phase-id"));
    expect(renderedPhases).toEqual(["phase-1", "phase-3", "phase-2"]);

    // Milestone 1 has custom title "Beta Launch"
    const phase1Header = container.querySelector("[data-roadmap-phase-id='phase-1']");
    expect(phase1Header?.textContent).toContain("Beta Launch");

    // Milestone 3 (now index 1, badge "Milestone 2") must NOT display "Milestone 3" or "Milestone 2" as custom title
    const phase3Header = container.querySelector("[data-roadmap-phase-id='phase-3']");
    expect(phase3Header?.textContent).toContain("Milestone 2");
    expect(phase3Header?.textContent).toContain("No title yet");
    expect(phase3Header?.querySelector("[data-roadmap-phase-title='phase-3']")?.textContent).toBe("No title yet");

    // Milestone 2 (now index 2, badge "Milestone 3") must NOT display "Milestone 2" as custom title
    const phase2Header = container.querySelector("[data-roadmap-phase-id='phase-2']");
    expect(phase2Header?.textContent).toContain("Milestone 3");
    expect(phase2Header?.textContent).toContain("No title yet");
    expect(phase2Header?.querySelector("[data-roadmap-phase-title='phase-2']")?.textContent).toBe("No title yet");

    await act(async () => {
      root.unmount();
    });
  });

  test("changing event status updates card immediately while persistence is in flight and locks refresh (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    let resolveFetch!: (res: Response) => void;
    const pendingFetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    fetchMock.mockReturnValueOnce(pendingFetchPromise);

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: "2026-05-01",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: "Initial description",
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    const statusButton = Array.from(container.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Planned") &&
        btn.getAttribute("aria-label")?.includes("Change status")
    );

    expect(statusButton).not.toBeUndefined();

    // Click status button
    act(() => {
      statusButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 1. Immediate UI update: Card and badge immediately update to Active before fetch finishes
    const eventCard = container.querySelector("[data-roadmap-event-card='event-1']");
    expect(eventCard?.getAttribute("data-roadmap-event-status")).toBe("active");
    expect(eventCard?.getAttribute("data-roadmap-event-status-pending")).toBe("true");

    // 2. Button shows disabled/pending state and panel is locked from refresh
    const activeBadgeButton = eventCard?.querySelector("button[data-status-pending='true']");
    expect(activeBadgeButton).not.toBeNull();
    expect(activeBadgeButton?.getAttribute("aria-busy")).toBe("true");
    expect(activeBadgeButton?.getAttribute("disabled")).not.toBeNull();
    expect(activeBadgeButton?.getAttribute("title")).toContain("Saving Task 1 status");

    const cardContainer = container.querySelector("[data-project-live-refresh-lock='true']");
    expect(cardContainer).not.toBeNull();

    // 3. Duplicate clicks while pending are ignored
    act(() => {
      activeBadgeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 4. Resolve the fetch successfully
    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            event: {
              ...initialPhases[0]!.events[0]!,
              status: "active",
            },
            phase: {
              ...initialPhases[0]!,
              events: [
                {
                  ...initialPhases[0]!.events[0]!,
                  status: "active",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:01.000Z",
            },
          }
        )
      );
    });

    // 5. Success state: pending cleared, card stays Active, toast shown, no router.refresh
    expect(eventCard?.getAttribute("data-roadmap-event-status")).toBe("active");
    expect(eventCard?.getAttribute("data-roadmap-event-status-pending")).toBeNull();
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Task 1 marked as active.",
      variant: "success",
    });
    expect(routerRefreshMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("failed event status persistence restores affected event and shows error toast (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "roadmap-event-update-failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: "2026-05-01",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-01",
            status: "completed" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    const statusButton = Array.from(container.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Planned") &&
        btn.getAttribute("aria-label")?.includes("Change status")
    );

    await act(async () => {
      statusButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Error toast shown
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Could not update roadmap event. Please retry.",
      variant: "error",
    });

    // Event 1 restored to "planned"
    const eventCard1 = container.querySelector("[data-roadmap-event-card='event-1']");
    expect(eventCard1?.getAttribute("data-roadmap-event-status")).toBe("planned");
    expect(eventCard1?.getAttribute("data-roadmap-event-status-pending")).toBeNull();

    // Event 2 remains untouched as "completed"
    const eventCard2 = container.querySelector("[data-roadmap-event-card='event-2']");
    expect(eventCard2?.getAttribute("data-roadmap-event-status")).toBe("completed");

    await act(async () => {
      root.unmount();
    });
  });

  test("dragging event within same milestone reorders events immediately without full-panel reload (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:01.000Z",
        },
      })
    );

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: "2026-05-01",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    // Initial order: Task 1 then Task 2
    let cards = Array.from(container.querySelectorAll("[data-roadmap-event-card]"));
    expect(cards[0]?.getAttribute("data-roadmap-event-card")).toBe("event-1");
    expect(cards[1]?.getAttribute("data-roadmap-event-card")).toBe("event-2");

    // Drag event-1 to index 1
    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-1",
        source: { droppableId: "phase-1", index: 0 },
        destination: { droppableId: "phase-1", index: 1 },
      });
    });

    // Reorder API was called
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/roadmap/events/reorder", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phaseId: "phase-1",
        eventIds: ["event-2", "event-1"],
      }),
    });

    // Reordered order in DOM: Task 2 then Task 1
    cards = Array.from(container.querySelectorAll("[data-roadmap-event-card]"));
    expect(cards[0]?.getAttribute("data-roadmap-event-card")).toBe("event-2");
    expect(cards[1]?.getAttribute("data-roadmap-event-card")).toBe("event-1");

    // No visible panel refresh
    expect(routerRefreshMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("dragging event into new milestone drop lane creates milestone and moves event immediately (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    let resolveCreatePhase!: (res: Response) => void;
    const createPhasePromise = new Promise<Response>((resolve) => {
      resolveCreatePhase = resolve;
    });

    fetchMock.mockReturnValueOnce(createPhasePromise);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:01.000Z",
        },
      })
    );

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: "2026-05-01",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-15",
            status: "planned" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    // Drop event-2 to new milestone
    act(() => {
      capturedOnDragEnd!({
        draggableId: "event-2",
        source: { droppableId: "phase-1", index: 1 },
        destination: { droppableId: "__roadmap-drop-new-milestone__", index: 0 },
      });
    });

    // 1. Immediate UI update: 2 milestones rendered immediately before fetch resolves!
    expect(container.querySelectorAll("[data-roadmap-phase-id]").length).toBe(2);
    const phase1Section = container.querySelector("[data-roadmap-phase-id='phase-1']");
    expect(phase1Section?.textContent).toContain("1 event");
    expect(phase1Section?.querySelector("[data-roadmap-event-card='event-2']")).toBeNull();

    // New milestone has event-2 immediately
    const event2Card = container.querySelector("[data-roadmap-event-card='event-2']");
    expect(event2Card).not.toBeNull();

    // 2. Resolve creation and move
    await act(async () => {
      resolveCreatePhase(
        new Response(
          JSON.stringify({
            phase: {
              id: "phase-2",
              title: "Milestone 2",
              description: null,
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
              [PROJECT_ACTIVITY_VERSION_HEADER]: "2026-04-20T00:00:01.000Z",
            },
          }
        )
      );
    });

    // Reconciled with phase-2
    expect(container.querySelector("[data-roadmap-phase-id='phase-2']")).not.toBeNull();
    expect(routerRefreshMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("failed persistence when dropping into new milestone reverts optimistic milestone (ND-534)", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "roadmap-phase-create-failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: "2026-05-01",
        status: "planned" as const,
        position: 0,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            phaseId: "phase-1",
            title: "Task 1",
            description: null,
            targetDate: "2026-05-01",
            status: "planned" as const,
            position: 0,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "event-2",
            phaseId: "phase-1",
            title: "Task 2",
            description: null,
            targetDate: "2026-05-15",
            status: "planned" as const,
            position: 1,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    ];

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

    // Error toast
    expect(pushToastMock).toHaveBeenCalledWith({
      message: "Could not create roadmap phase. Please retry.",
      variant: "error",
    });

    // Only 1 milestone remains, and event-2 is restored to phase-1
    expect(container.querySelectorAll("[data-roadmap-phase-id]").length).toBe(1);
    const phase1Section = container.querySelector("[data-roadmap-phase-id='phase-1']");
    expect(phase1Section?.textContent).toContain("2 events");
    expect(phase1Section?.querySelector("[data-roadmap-event-card='event-2']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("does not display 'Draft saved locally in this browser' when creating an event", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: null,
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        events: [],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    const newEventButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New event")
    );
    expect(newEventButton).not.toBeUndefined();

    await act(async () => {
      newEventButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const titleInput = document.body.querySelector<HTMLInputElement>("#roadmap-entity-title");
    expect(titleInput).not.toBeNull();

    await act(async () => {
      if (titleInput) {
        titleInput.value = "New deliverable";
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        titleInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // The routine locally-stored draft notice must NOT be rendered
    expect(document.body.textContent).not.toContain("Draft saved locally in this browser.");

    await act(async () => {
      root.unmount();
    });
  });

  test("horizontally auto-scrolls desktop roadmap container all the way to the left when dragging event near or beyond left edge", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    const initialPhases = [
      {
        id: "phase-1",
        title: "Milestone 1",
        description: null,
        targetDate: null,
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        events: [
          {
            id: "event-1",
            title: "Event 1",
            description: null,
            targetDate: null,
            status: "PLANNED" as const,
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-2",
        title: "Milestone 2",
        description: null,
        targetDate: null,
        order: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        events: [
          {
            id: "event-2",
            title: "Event 2",
            description: null,
            targetDate: null,
            status: "PLANNED" as const,
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: "phase-3",
        title: "Milestone 3",
        description: null,
        targetDate: null,
        order: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        events: [
          {
            id: "event-3",
            title: "Event 3",
            description: null,
            targetDate: null,
            status: "PLANNED" as const,
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ];

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: initialPhases,
      })
    );

    const scrollContainer = container.querySelector<HTMLDivElement>(
      "[data-roadmap-scroll-container='true']"
    );
    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      return;
    }

    Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 1600 });
    let currentScrollLeft = 500;
    Object.defineProperty(scrollContainer, "scrollLeft", {
      configurable: true,
      get: () => currentScrollLeft,
      set: (val: number) => {
        currentScrollLeft = val;
      },
    });

    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({
      left: 200,
      right: 800,
      top: 100,
      bottom: 500,
      width: 600,
      height: 400,
      x: 200,
      y: 100,
      toJSON: () => {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, version: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    // Start drag
    await act(async () => {
      capturedOnDragStart!();
    });

    // Move pointer all the way to the left (beyond container.left = 200, e.g. at clientX = 50)
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 50,
          clientY: 250,
        })
      );
    });

    expect(rafCallback).not.toBeNull();

    // Step 1 animation frame: should scroll left by MAX_SPEED (28px)
    await act(async () => {
      const cb = rafCallback;
      rafCallback = null;
      cb?.(performance.now());
    });

    expect(currentScrollLeft).toBe(500 - 28);
    expect(rafCallback).not.toBeNull();

    // Fast-forward scroll to near 0
    currentScrollLeft = 10;
    await act(async () => {
      const cb = rafCallback;
      rafCallback = null;
      cb?.(performance.now());
    });

    // Reached 0 (Milestone 1 is now fully in view)
    expect(currentScrollLeft).toBe(0);

    // Final step at scrollLeft === 0: no further frame scheduled
    await act(async () => {
      const cb = rafCallback;
      rafCallback = null;
      cb?.(performance.now());
    });

    expect(rafCallback).toBeNull();

    // End drag
    await act(async () => {
      await capturedOnDragEnd!({
        draggableId: "event-3",
        source: { droppableId: "phase-3", index: 0 },
        destination: { droppableId: "phase-1", index: 1 },
      });
    });

    await act(async () => {
      root.unmount();
    });
  });
});
