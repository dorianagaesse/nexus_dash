// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerRefreshMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const setIsExpandedMock = vi.hoisted(() => vi.fn());
const projectSectionExpandedMock = vi.hoisted(() => ({
  isExpanded: false,
  setIsExpanded: setIsExpandedMock,
}));

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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    projectSectionExpandedMock.isExpanded = false;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("expands the section before opening the create milestone flow", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        phases: [],
      })
    );

    const newMilestoneButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New milestone")
    );

    expect(newMilestoneButton).not.toBeUndefined();

    await act(async () => {
      newMilestoneButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setIsExpandedMock).toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("renders grouped milestone and event content when expanded", async () => {
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
    expect(container.textContent).toContain("Private beta");
    expect(container.textContent).toContain("Invite wave one");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("1 event");

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

    const detailDialog = container.querySelector("[role='dialog']");
    expect(detailDialog?.textContent).toContain("Invite wave one");
    expect(detailDialog?.textContent).toContain(fullDescription);
    expect(detailDialog?.textContent).toContain("Private beta");

    await act(async () => {
      root.unmount();
    });
  });
});
