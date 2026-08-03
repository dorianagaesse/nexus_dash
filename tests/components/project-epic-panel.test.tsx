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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

  test("keeps epic details collapsed while preserving semantic title and progress", async () => {
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
    const disclosure = container.querySelector(
      `button[aria-label="Show details for ${epicWithDenseLinkedTasks.name}"]`
    );
    const detailsId = disclosure?.getAttribute("aria-controls");
    const details = detailsId ? document.getElementById(detailsId) : null;

    expect(article?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(heading?.textContent).toBe("Launch workspace sharing");
    expect(details?.textContent).toContain(
      epicWithDenseLinkedTasks.description
    );
    expect(details?.hidden).toBe(true);
    expect(progress?.getAttribute("aria-valuenow")).toBe("25");
    expect(progress?.getAttribute("aria-valuetext")).toBe(
      "2 of 8 tasks completed"
    );
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure?.className).toContain("min-h-11");
    expect(disclosure?.className).toContain("min-w-11");
    expect(disclosure?.textContent).toBe("");
    expect(disclosure?.getAttribute("title")).toBe("Show details");
    expect(details?.querySelectorAll("li")).toHaveLength(7);
    expect(details?.textContent).toContain("+2 more linked tasks");
    expect(
      container.querySelector(
        `button[aria-label="Edit epic ${epicWithDenseLinkedTasks.name}"]`
      )
    ).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("expands and collapses each epic independently", async () => {
    projectSectionExpandedMock.isExpanded = true;
    const { container, root } = createTestRenderer();
    const secondEpic = {
      ...epicWithDenseLinkedTasks,
      id: "epic-2",
      name: "Confirm launch readiness",
      description: "Confirm the product is ready for invited teams.",
      taskCount: 0,
      completedTaskCount: 0,
      progressPercent: 0,
      linkedTasks: [],
    };

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [epicWithDenseLinkedTasks, secondEpic],
      })
    );

    const findDisclosure = (label: string) =>
      container.querySelector(`button[aria-label="${label}"]`);
    const firstDisclosure = findDisclosure(
      `Show details for ${epicWithDenseLinkedTasks.name}`
    );
    const secondDisclosure = findDisclosure(
      `Show details for ${secondEpic.name}`
    );
    const firstDetails = document.getElementById("epic-epic-1-details");
    const secondDetails = document.getElementById("epic-epic-2-details");

    expect(firstDisclosure?.getAttribute("aria-controls")).toBe(
      "epic-epic-1-details"
    );
    expect(firstDetails?.hidden).toBe(true);
    expect(secondDetails?.hidden).toBe(true);

    await act(async () => {
      firstDisclosure?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const expandedDisclosure = findDisclosure(
      `Hide details for ${epicWithDenseLinkedTasks.name}`
    );
    expect(expandedDisclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(expandedDisclosure?.getAttribute("title")).toBe("Hide details");
    expect(firstDetails?.hidden).toBe(false);
    expect(secondDisclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(secondDetails?.hidden).toBe(true);

    await act(async () => {
      expandedDisclosure?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(
      findDisclosure(
        `Show details for ${epicWithDenseLinkedTasks.name}`
      )?.getAttribute("aria-expanded")
    ).toBe("false");
    expect(firstDetails?.hidden).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps the editing article name synchronized with the name field", async () => {
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

    const editButton = container.querySelector(
      `button[aria-label="Edit epic ${epicWithDenseLinkedTasks.name}"]`
    );

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const article = container.querySelector("article");
    const nameInput = container.querySelector(
      `#edit-epic-name-${epicWithDenseLinkedTasks.id}`
    ) as HTMLInputElement | null;

    expect(article?.getAttribute("aria-label")).toBe(
      `Edit epic ${epicWithDenseLinkedTasks.name}`
    );

    await act(async () => {
      if (nameInput) {
        setInputValue(nameInput, "Launch collaboration beta");
      }
    });

    expect(article?.getAttribute("aria-label")).toBe(
      "Edit epic Launch collaboration beta"
    );

    await act(async () => {
      root.unmount();
    });
  });
});
