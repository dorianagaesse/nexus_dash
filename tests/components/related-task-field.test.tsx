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

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STATUSES = ["Backlog", "In Progress", "Blocked", "Done"] as const;
const AVAILABLE_TASKS: RelatedTaskOption[] = STATUSES.flatMap((status) =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `${status.toLowerCase().replaceAll(" ", "-")}-${index + 1}`,
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

    expect(container.textContent).toContain(lastOption?.textContent);
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
});
