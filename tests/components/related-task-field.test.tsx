// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  RelatedTaskSelector,
  type RelatedTaskOption,
} from "@/components/kanban/related-task-field";
import type { TaskRelatedSummary } from "@/components/kanban-board-types";
import { TASK_STATUS_BADGE_CLASS_NAMES } from "@/components/kanban/task-status-presentation";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STATUSES = ["Backlog", "In Progress", "Blocked", "Done"] as const;
const AVAILABLE_TASKS: RelatedTaskOption[] = STATUSES.flatMap((status) =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `${status.toLowerCase().replaceAll(" ", "-")}-${index + 1}`,
    reference: `ND-${STATUSES.indexOf(status) * 3 + index + 1}`,
    title: `${status} candidate ${index + 1}`,
    status,
  }))
);

function Harness({
  availableTasks = AVAILABLE_TASKS,
  initialSelectedTasks = [],
}: {
  availableTasks?: RelatedTaskOption[];
  initialSelectedTasks?: TaskRelatedSummary[];
}) {
  const [selectedTasks, setSelectedTasks] =
    useState<TaskRelatedSummary[]>(initialSelectedTasks);
  const [searchValue, setSearchValue] = useState("");

  return (
    <RelatedTaskSelector
      selectedTasks={selectedTasks}
      availableTasks={availableTasks}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onAddTask={(taskId) => {
        const task = availableTasks.find(
          (candidate) => candidate.id === taskId
        );
        if (!task) {
          return;
        }

        setSelectedTasks((currentTasks) => [
          ...currentTasks,
          {
            ...task,
            archivedAt: null,
          },
        ]);
        setSearchValue("");
      }}
      onRemoveTask={(taskId) => {
        setSelectedTasks((currentTasks) =>
          currentTasks.filter((task) => task.id !== taskId)
        );
      }}
    />
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getOptions(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>("[role='option']")
  );
}

describe("RelatedTaskSelector", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderHarness(
    props: Parameters<typeof Harness>[0] = {}
  ): Promise<HTMLInputElement> {
    await act(async () => {
      root.render(<Harness {...props} />);
    });

    return container.querySelector<HTMLInputElement>(
      "input[aria-label='Search related tasks']"
    )!;
  }

  test("renders the complete mixed-status candidate set and searches all of it", async () => {
    const input = await renderHarness();

    await act(async () => {
      input.focus();
    });
    await act(async () => {});

    expect(getOptions()).toHaveLength(12);
    for (const status of STATUSES) {
      expect(
        getOptions().filter((option) => option.dataset.taskStatus === status)
      ).toHaveLength(3);
    }

    const listbox = document.body.querySelector<HTMLElement>(
      "[data-related-task-listbox='true']"
    );
    expect(listbox?.className).toContain("overflow-y-auto");
    expect(listbox?.className).toContain("overscroll-contain");
    expect(
      Number.parseInt(listbox?.style.maxHeight ?? "0", 10)
    ).toBeGreaterThan(0);

    await act(async () => {
      setInputValue(input, "Blocked candidate 3");
    });

    expect(getOptions()).toHaveLength(1);
    expect(getOptions()[0]?.textContent).toContain("Blocked candidate 3");

    await act(async () => {
      setInputValue(input, "ND-10");
    });

    expect(getOptions()).toHaveLength(1);
    expect(getOptions()[0]?.textContent).toContain("ND-10");
    expect(getOptions()[0]?.textContent).toContain("Done candidate 1");
    expect(getOptions()[0]?.getAttribute("aria-label")).toBe(
      "ND-10, Done candidate 1, Done"
    );
  });

  test("presents references, bounded titles, and shared Kanban status badges", async () => {
    const longTitle =
      "A deliberately long related-task title that must remain available while the visible row truncates";
    const input = await renderHarness({
      availableTasks: STATUSES.map((status, index) => ({
        id: `presentation-${index}`,
        reference: `ND-${index + 101}`,
        title: index === 0 ? longTitle : `${status} presentation candidate`,
        status,
      })),
    });

    await act(async () => {
      input.focus();
    });
    await act(async () => {});

    const options = getOptions();
    expect(options).toHaveLength(4);
    expect(options[0]?.className).toContain(
      "grid-cols-[minmax(4rem,auto)_minmax(0,1fr)_auto]"
    );
    expect(options[0]?.className).toContain("min-h-11");

    for (const [index, status] of STATUSES.entries()) {
      const option = options[index]!;
      const title = index === 0 ? longTitle : `${status} presentation candidate`;
      const titleElement = option.querySelector<HTMLElement>("[title]");
      const statusBadge = option.querySelector<HTMLElement>(
        "[data-task-status-badge='true']"
      );

      expect(option.getAttribute("aria-label")).toBe(
        `ND-${index + 101}, ${title}, ${status}`
      );
      expect(titleElement?.title).toBe(title);
      expect(titleElement?.className).toContain("truncate");
      expect(statusBadge?.textContent).toBe(status);
      for (const className of TASK_STATUS_BADGE_CLASS_NAMES[status].split(" ")) {
        expect(statusBadge?.className).toContain(className);
      }
    }
  });

  test("keeps keyboard navigation on the input while reaching and selecting the last task", async () => {
    const input = await renderHarness();

    await act(async () => {
      input.focus();
    });
    await act(async () => {});
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "End",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await act(async () => {});

    const options = getOptions();
    const lastOption = options.at(-1);
    expect(lastOption?.dataset.active).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(lastOption?.id);
    expect(document.activeElement).toBe(input);
    expect(scrollIntoView).toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(container.textContent).toContain(lastOption?.dataset.taskTitle);
    expect(getOptions()).toHaveLength(11);
  });

  test("distinguishes an empty candidate set from a search with no matches", async () => {
    const emptyInput = await renderHarness({ availableTasks: [] });

    await act(async () => {
      emptyInput.focus();
    });
    await act(async () => {});

    expect(document.body.textContent).toContain(
      "No other active tasks are available."
    );
    const emptyListbox = document.body.querySelector<HTMLElement>(
      "[role='listbox']"
    );
    expect(emptyListbox).not.toBeNull();
    expect(emptyInput.getAttribute("aria-controls")).toBe(emptyListbox?.id);
    expect(emptyInput.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      root.render(<Harness />);
    });
    const searchInput = container.querySelector<HTMLInputElement>(
      "input[aria-label='Search related tasks']"
    )!;
    await act(async () => {
      searchInput.focus();
      setInputValue(searchInput, "not-a-task");
    });

    expect(document.body.textContent).toContain(
      "No active tasks match “not-a-task”."
    );
  });

  test("does not reposition the popover when the scroll target is inside it", async () => {
    const input = await renderHarness();

    await act(async () => {
      input.focus();
    });
    await act(async () => {});

    const listbox = document.body.querySelector<HTMLElement>(
      "[data-related-task-listbox='true']"
    );
    expect(listbox).not.toBeNull();

    const popover = document.body.querySelector<HTMLElement>(
      '[data-overlay-popover="true"]'
    );
    expect(popover).not.toBeNull();
    const popoverTopBefore = popover?.style.top;

    const scrollEvent = new Event("scroll", { bubbles: true });
    listbox?.dispatchEvent(scrollEvent);

    await act(async () => {});

    expect(scrollEvent.target).toBe(listbox);
    expect(popover?.style.top).toBe(popoverTopBefore);
  });

  test("keeps modal wheel events inside the scroll lock and pointer movement passive", async () => {
    container.setAttribute("data-overlay-content", "true");
    const input = await renderHarness();

    await act(async () => {
      input.focus();
    });
    await act(async () => {});

    const listbox = document.body.querySelector<HTMLElement>(
      "[data-related-task-listbox='true']"
    );
    expect(listbox).not.toBeNull();

    const popover = document.body.querySelector<HTMLElement>(
      '[data-overlay-popover="true"]'
    );
    expect(popover).not.toBeNull();
    expect(popover?.contains(listbox)).toBe(true);
    expect(popover?.parentElement).toBe(container);
    expect(popover?.style.position).toBe("absolute");

    expect(popover?.className).toContain("overflow-hidden");
    const popoverMaxHeight = Number.parseInt(
      popover?.style.maxHeight ?? "0",
      10
    );
    expect(popoverMaxHeight).toBeGreaterThan(0);

    const listMaxHeight = Number.parseInt(
      listbox?.style.maxHeight ?? "0",
      10
    );
    expect(listMaxHeight).toBeGreaterThan(0);
    expect(popoverMaxHeight).toBeGreaterThanOrEqual(listMaxHeight);

    expect(listbox?.className).toContain("overflow-y-auto");
    expect(listbox?.className).toContain("overscroll-contain");

    const option = getOptions()[4];
    expect(option).toBeDefined();
    expect(listbox?.contains(option!)).toBe(true);

    scrollIntoView.mockClear();
    option?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await act(async () => {});

    expect(option?.dataset.active).toBeUndefined();
    expect(option?.getAttribute("aria-selected")).toBe("false");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();

    let wheelBubbledToListbox = false;
    listbox?.addEventListener(
      "wheel",
      () => {
        wheelBubbledToListbox = true;
      },
      { once: true }
    );
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    option?.dispatchEvent(wheelEvent);
    await act(async () => {});
    expect(wheelBubbledToListbox).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
  });
});
