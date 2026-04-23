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

  test("expands the section before opening the create flow", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: true,
        milestones: [],
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

  test("renders milestone content when expanded", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectRoadmapPanel, {
        projectId: "project-1",
        canEdit: false,
        milestones: [
          {
            id: "milestone-1",
            title: "Private beta",
            description: "Open the first customer wave.",
            targetDate: "2026-05-02",
            status: "active",
            position: 0,
            createdAt: "2026-04-23T08:00:00.000Z",
            updatedAt: "2026-04-23T08:00:00.000Z",
          },
        ],
      })
    );

    expect(container.textContent).toContain("Roadmap");
    expect(container.textContent).toContain("Private beta");
    expect(container.textContent).toContain("Open the first customer wave.");
    expect(container.textContent).toContain("Active");

    await act(async () => {
      root.unmount();
    });
  });
});
