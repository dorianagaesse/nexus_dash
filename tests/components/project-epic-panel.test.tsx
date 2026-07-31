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

import { ProjectEpicPanel } from "@/components/project-epic-panel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const epicWithDenseLinkedTasks = {
  id: "epic-1",
  name: "Launch workspace sharing",
  description:
    "Give every collaborator enough context to understand the rollout, its intended outcome, and the work that remains.",
  status: "In progress" as const,
  progressPercent: 25,
  taskCount: 8,
  completedTaskCount: 2,
  linkedTasks: Array.from({ length: 8 }, (_, index) => ({
    id: `task-${index + 1}`,
    title:
      index === 7
        ? "Validate a deliberately long linked task title without truncating meaningful context"
        : `Launch task ${index + 1}`,
    status: index < 2 ? "Done" : "Backlog",
    archivedAt: null,
  })),
  createdAt: "2026-07-31T08:00:00.000Z",
  updatedAt: "2026-07-31T08:00:00.000Z",
};

describe("project-epic-panel", () => {
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
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [],
      })
    );

    const newEpicButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New epic")
    );

    expect(newEpicButton).not.toBeUndefined();

    await act(async () => {
      newEpicButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setIsExpandedMock).toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps the header aligned with other section UIs by omitting the subtitle copy", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [],
      })
    );

    expect(container.textContent).toContain("Epics");
    expect(container.textContent).not.toContain(
      "Higher-level initiatives with automatic state and progress."
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("renders expanded epic context with semantic article and progress details", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: false,
        epics: [epicWithDenseLinkedTasks],
      })
    );

    const article = container.querySelector("article");
    const heading = article?.querySelector("h3");
    const progress = container.querySelector('[role="progressbar"]');
    const taskRows = Array.from(container.querySelectorAll("li"));
    const desktopDisclosure = Array.from(
      container.querySelectorAll("button")
    ).find((button) =>
      button.textContent?.includes("Show 2 more linked tasks")
    );

    expect(article?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(heading?.textContent).toBe("Launch workspace sharing");
    expect(container.textContent).toContain(
      epicWithDenseLinkedTasks.description
    );
    expect(progress?.getAttribute("aria-valuenow")).toBe("25");
    expect(progress?.getAttribute("aria-valuetext")).toBe(
      "2 of 8 tasks completed"
    );
    expect(taskRows).toHaveLength(8);
    expect(taskRows[7]?.textContent).toContain(
      "without truncating meaningful context"
    );
    expect(taskRows[7]?.className).toContain("lg:hidden");
    expect(desktopDisclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(desktopDisclosure?.className).toContain("min-h-11");
    expect(desktopDisclosure?.className).toContain("lg:inline-flex");
    expect(container.textContent).not.toContain("+2 more");
    expect(
      container.querySelector(
        `button[aria-label="Edit epic ${epicWithDenseLinkedTasks.name}"]`
      )
    ).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("expands and collapses dense desktop linked-task lists accessibly", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [epicWithDenseLinkedTasks],
      })
    );

    const findDisclosure = () =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("linked task")
      );

    const disclosure = findDisclosure();
    const linkedTasksId = disclosure?.getAttribute("aria-controls");

    expect(linkedTasksId).toBe("epic-epic-1-linked-tasks");

    await act(async () => {
      disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const expandedDisclosure = findDisclosure();
    expect(expandedDisclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(expandedDisclosure?.textContent).toContain(
      "Show fewer linked tasks"
    );
    expect(
      Array.from(container.querySelectorAll("li"))[7]?.className
    ).not.toContain("lg:hidden");

    await act(async () => {
      expandedDisclosure?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(findDisclosure()?.getAttribute("aria-expanded")).toBe("false");
    expect(
      Array.from(container.querySelectorAll("li"))[7]?.className
    ).toContain("lg:hidden");

    await act(async () => {
      root.unmount();
    });
  });
});
