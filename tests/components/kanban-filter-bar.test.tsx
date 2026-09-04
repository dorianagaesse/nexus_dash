// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { KanbanFilterBar } from "@/components/kanban/kanban-filter-bar";
import { NO_EPIC_FILTER_VALUE } from "@/components/kanban/kanban-filter-utils";
import type { ProjectEpicOption } from "@/components/kanban-board-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AVAILABLE_LABELS = ["Frontend", "Urgent"];

const AVAILABLE_EPICS: ProjectEpicOption[] = [
  {
    id: "epic-a",
    name: "Alpha launch",
    status: "In progress",
    progressPercent: 50,
    taskCount: 2,
  },
  {
    id: "epic-b",
    name: "Beta readiness",
    status: "Ready",
    progressPercent: 0,
    taskCount: 1,
  },
];

interface HarnessProps {
  initialQuery?: string;
  initialLabels?: string[];
  initialEpics?: string[];
  isSearchLoading?: boolean;
  searchError?: string | null;
  onRetrySearch?: () => void;
  onClearAll?: () => void;
}

function Harness({
  initialQuery = "",
  initialLabels = [],
  initialEpics = [],
  isSearchLoading = false,
  searchError = null,
  onRetrySearch = vi.fn(),
  onClearAll = vi.fn(),
}: HarnessProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(
    () => new Set(initialLabels)
  );
  const [selectedEpicFilters, setSelectedEpicFilters] = useState<Set<string>>(
    () => new Set(initialEpics)
  );

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (value: string) => {
      setter((current) => {
        const next = new Set(current);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    };

  return (
    <KanbanFilterBar
      query={query}
      availableLabels={AVAILABLE_LABELS}
      availableEpics={AVAILABLE_EPICS}
      selectedLabels={selectedLabels}
      selectedEpicFilters={selectedEpicFilters}
      isSearchLoading={isSearchLoading}
      searchError={searchError}
      onQueryChange={setQuery}
      onToggleLabel={toggleIn(setSelectedLabels)}
      onToggleEpic={toggleIn(setSelectedEpicFilters)}
      onClearAll={() => {
        setQuery("");
        setSelectedLabels(new Set());
        setSelectedEpicFilters(new Set());
        onClearAll();
      }}
      onRetrySearch={onRetrySearch}
    />
  );
}

const mountedRoots: Root[] = [];

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  return { container, root };
}

async function renderWithRoot(root: Root, ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const filterTrigger = () =>
  document.body.querySelector<HTMLButtonElement>('button[aria-expanded]');
const filterPanel = () =>
  document.body.querySelector<HTMLElement>("#kanban-filter-panel");
const searchInput = () =>
  document.body.querySelector<HTMLInputElement>("#kanban-task-search");
const pressedOptions = () =>
  document.body.querySelectorAll('button[aria-pressed="true"]');
const optionByText = (text: string) =>
  Array.from(document.body.querySelectorAll('button[aria-pressed]')).find(
    (button) => button.textContent === text
  ) ?? null;
const clearSearchButton = () =>
  document.body.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');
const buttonByText = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text
  ) ?? null;

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("KanbanFilterBar", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
  });

  afterEach(async () => {
    await act(async () => {
      mountedRoots.forEach((root) => root.unmount());
      mountedRoots.length = 0;
    });
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("opens a filter panel grouping labels and epics with unchecked options", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);

    expect(filterPanel()).toBeNull();

    await click(filterTrigger());
    expect(filterTrigger()?.getAttribute("aria-expanded")).toBe("true");
    expect(filterPanel()).not.toBeNull();
    expect(
      document.body.querySelector('[role="group"][aria-label="Labels"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('[role="group"][aria-label="Epics"]')
    ).not.toBeNull();
    expect(optionByText("Frontend")).not.toBeNull();
    expect(optionByText("Alpha launch")).not.toBeNull();
    expect(optionByText("No epic")).not.toBeNull();
    expect(pressedOptions()).toHaveLength(0);
    expect(optionByText("Frontend")?.querySelector(".lucide-check")).toBeNull();
  });

  test("toggles options with multi-select semantics and keeps the panel open", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);
    await click(filterTrigger());

    await click(optionByText("Frontend"));
    await click(optionByText("Alpha launch"));
    await click(optionByText("No epic"));

    expect(pressedOptions()).toHaveLength(3);
    expect(filterPanel()).not.toBeNull();
    expect(optionByText("Frontend")?.querySelector(".lucide-check")).not.toBeNull();
    expect(optionByText("No epic")?.querySelector(".lucide-check")).not.toBeNull();

    await click(optionByText("Frontend"));
    expect(pressedOptions()).toHaveLength(2);
    expect(optionByText("Frontend")?.querySelector(".lucide-check")).toBeNull();
  });

  test("counts active label and epic filters on the trigger alongside a search query", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(
      root,
      <Harness initialQuery="launch" initialLabels={["Frontend"]} initialEpics={["epic-a"]} />
    );

    const trigger = filterTrigger();
    expect(trigger?.textContent).toContain("Filter");
    expect(trigger?.textContent).toContain("2");
    expect(trigger?.querySelectorAll("span")).toHaveLength(2);
  });

  test("shows no badge for a bare search query", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness initialQuery="launch" />);
    expect(filterTrigger()?.querySelectorAll("span")).toHaveLength(1);
  });

  test("never announces a shown-tasks ratio", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(
      root,
      <Harness
        initialQuery="launch"
        initialLabels={["Frontend"]}
        initialEpics={[NO_EPIC_FILTER_VALUE]}
      />
    );

    expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+\s*tasks?/);
    expect(document.body.textContent).not.toContain("tasks shown");
  });

  test("clears the search with the X button and reflects loading and errors", async () => {
    const onRetrySearch = vi.fn();
    const { root } = createTestRenderer();
    await renderWithRoot(
      root,
      <Harness isSearchLoading={false} searchError={null} onRetrySearch={onRetrySearch} />
    );

    expect(clearSearchButton()).toBeNull();
    await act(async () => {
      setInputValue(searchInput()!, "launch");
    });
    expect(searchInput()?.value).toBe("launch");
    expect(clearSearchButton()).not.toBeNull();
    expect(document.body.querySelector(".animate-spin")).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();

    await renderWithRoot(
      root,
      <Harness
        initialQuery="launch"
        isSearchLoading={true}
        searchError="Search is unavailable right now."
        onRetrySearch={onRetrySearch}
      />
    );
    expect(document.body.querySelector(".animate-spin")).not.toBeNull();

    const alert = document.body.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Search is unavailable right now.");
    await click(buttonByText("Retry"));
    expect(onRetrySearch).toHaveBeenCalledTimes(1);

    await click(clearSearchButton());
    expect(searchInput()?.value).toBe("");
    expect(clearSearchButton()).toBeNull();
  });

  test("closes on Escape and restores focus to the filter trigger", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);
    await click(filterTrigger());
    expect(filterPanel()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(filterPanel()).toBeNull();
    expect(filterTrigger()?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(filterTrigger());
  });

  test("closes on an outside pointerdown", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);
    await click(filterTrigger());

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true })
      );
    });

    expect(filterPanel()).toBeNull();
  });

  test("stays open when focus moves to the search box and closes quietly for outside focus", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);
    await click(filterTrigger());
    expect(filterPanel()).not.toBeNull();

    await act(async () => {
      searchInput()?.focus();
    });
    expect(filterPanel()).not.toBeNull();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    await act(async () => {
      outside.focus();
    });
    expect(filterPanel()).toBeNull();
    // Closing from an outside focus must not steal focus from the card/board.
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  test("hides Clear all filters when nothing is active", async () => {
    const { root } = createTestRenderer();
    await renderWithRoot(root, <Harness />);
    await click(filterTrigger());
    expect(buttonByText("Clear all filters")).toBeNull();
  });

  test("shows Clear all filters only while active and resets search and selections", async () => {
    const onClearAll = vi.fn();
    const { root } = createTestRenderer();
    await renderWithRoot(
      root,
      <Harness
        key="active"
        initialQuery="launch"
        initialLabels={["Frontend"]}
        initialEpics={["epic-a"]}
        onClearAll={onClearAll}
      />
    );
    expect(filterTrigger()?.querySelectorAll("span")).toHaveLength(2);

    await click(filterTrigger());
    expect(buttonByText("Clear all filters")).not.toBeNull();

    await click(buttonByText("Clear all filters"));
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(filterPanel()).toBeNull();
    expect(filterTrigger()?.querySelectorAll("span")).toHaveLength(1);
    expect(searchInput()?.value).toBe("");
    expect(document.activeElement).toBe(filterTrigger());

    await click(filterTrigger());
    expect(buttonByText("Clear all filters")).toBeNull();
    expect(pressedOptions()).toHaveLength(0);
  });
});
