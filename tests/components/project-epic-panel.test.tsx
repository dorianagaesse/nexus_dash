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
  archivedAt: null,
  createdAt: "2026-07-31T08:00:00.000Z",
  updatedAt: "2026-07-31T08:00:00.000Z",
};

function findButton(container: HTMLElement, labelFragment: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(labelFragment)
  );
}

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

describe("project-epic-panel archive controls", () => {
  const archivedEpic = {
    ...epicWithDenseLinkedTasks,
    id: "epic-archived",
    name: "Completed rollout",
    archivedAt: "2026-09-10T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectSectionExpandedMock.isExpanded = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("reveals archived epics only after toggling show archived", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [epicWithDenseLinkedTasks, archivedEpic],
      })
    );

    expect(container.textContent).not.toContain(archivedEpic.name);
    expect(container.textContent).toContain("1 epic");

    const toggleButton = findButton(container, "Show archived");
    expect(toggleButton?.textContent).toContain("Show archived (1)");

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(archivedEpic.name);
    expect(
      container.querySelector(`button[aria-label="Restore epic ${archivedEpic.name}"]`)
    ).not.toBeNull();
    expect(findButton(container, "Hide archived")).not.toBeUndefined();

    await act(async () => {
      findButton(container, "Hide archived")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(container.textContent).not.toContain(archivedEpic.name);

    await act(async () => {
      root.unmount();
    });
  });

  test("archives an epic through the archive endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        epic: {
          ...epicWithDenseLinkedTasks,
          archivedAt: "2026-09-13T10:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [epicWithDenseLinkedTasks],
      })
    );

    const archiveButton = container.querySelector(
      `button[aria-label="Archive epic ${epicWithDenseLinkedTasks.name}"]`
    );
    expect(archiveButton).not.toBeNull();

    await act(async () => {
      archiveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/project-1/epics/${epicWithDenseLinkedTasks.id}/archive`,
      { method: "POST" }
    );
    expect(pushToastMock).toHaveBeenCalledWith({
      variant: "success",
      message: "Epic archived.",
    });
    expect(routerRefreshMock).toHaveBeenCalled();
    expect(container.textContent).toContain("No active epics.");
    expect(findButton(container, "Show archived (1)")).not.toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });

  test("restores an archived epic through the archive endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        epic: {
          ...archivedEpic,
          archivedAt: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: true,
        epics: [archivedEpic],
      })
    );

    await act(async () => {
      findButton(container, "Show archived")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const restoreButton = container.querySelector(
      `button[aria-label="Restore epic ${archivedEpic.name}"]`
    );

    await act(async () => {
      restoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/project-1/epics/${archivedEpic.id}/archive`,
      { method: "DELETE" }
    );
    expect(pushToastMock).toHaveBeenCalledWith({
      variant: "success",
      message: "Epic restored.",
    });
    expect(findButton(container, "Show archived")).toBeUndefined();
    expect(
      container.querySelector(`button[aria-label="Archive epic ${archivedEpic.name}"]`)
    ).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("hides archive controls from viewers", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: false,
        epics: [epicWithDenseLinkedTasks, archivedEpic],
      })
    );

    await act(async () => {
      findButton(container, "Show archived")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(
      container.querySelector(
        `button[aria-label="Archive epic ${epicWithDenseLinkedTasks.name}"]`
      )
    ).toBeNull();
    expect(
      container.querySelector(`button[aria-label="Restore epic ${archivedEpic.name}"]`)
    ).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});

describe("project-epic-panel overlong linked-task titles", () => {
  function buildEpicWithLongTitle(title: string) {
    return {
      ...epicWithDenseLinkedTasks,
      id: "epic-long-title",
      name: "Launch workspace sharing",
      taskCount: 1,
      completedTaskCount: 0,
      progressPercent: 0,
      linkedTasks: [
        {
          id: "task-long",
          title,
          status: "Backlog" as const,
          archivedAt: null,
        },
      ],
    };
  }

  function renderExpandedEpic(
    container: HTMLElement,
    root: Root,
    title: string
  ) {
    projectSectionExpandedMock.isExpanded = true;

    return renderWithRoot(
      root,
      React.createElement(ProjectEpicPanel, {
        projectId: "project-1",
        canEdit: false,
        epics: [buildEpicWithLongTitle(title)],
      })
    ).then(async () => {
      const disclosure = container.querySelector<HTMLElement>(
        'button[aria-label="Show details for Launch workspace sharing"]'
      );
      await act(async () => {
        disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    });
  }

  test("clamps a long spaced linked-task title to two lines inside the epic chip", async () => {
    const longTitle =
      "Validate a deliberately long linked task title without truncating meaningful context";
    const { container, root } = createTestRenderer();
    await renderExpandedEpic(container, root, longTitle);

    const chip = container.querySelector<HTMLElement>(
      `li[title="${longTitle}"]`
    );
    expect(chip).not.toBeNull();
    const titleSpan = chip?.firstElementChild as HTMLElement | null;
    expect(titleSpan?.textContent).toBe(longTitle);
    expect(titleSpan?.className).toContain("line-clamp-2");
    expect(titleSpan?.className).toContain("[overflow-wrap:anywhere]");
    expect(chip?.textContent).toContain("Backlog");

    await act(async () => root.unmount());
  });

  test("keeps the full unbroken-word title in the chip DOM with wrap and clamp styling", async () => {
    const longWord =
      "Supercalifragilisticanticonstitutionallyambivalentlinkedtasktitle";
    const { container, root } = createTestRenderer();
    await renderExpandedEpic(container, root, longWord);

    const chip = container.querySelector<HTMLElement>(`li[title="${longWord}"]`);
    expect(chip).not.toBeNull();
    const titleSpan = chip?.firstElementChild as HTMLElement | null;
    expect(titleSpan?.textContent).toBe(longWord);
    expect(titleSpan?.className).toContain("line-clamp-2");
    expect(titleSpan?.className).toContain("[overflow-wrap:anywhere]");

    await act(async () => root.unmount());
  });
});
