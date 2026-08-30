// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { KanbanFilterToolbar } from "@/components/kanban/kanban-filter-toolbar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderToolbar(overrides: Partial<React.ComponentProps<typeof KanbanFilterToolbar>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const props: React.ComponentProps<typeof KanbanFilterToolbar> = {
    query: "",
    availableLabels: ["Frontend", "Urgent"],
    selectedLabels: new Set(),
    shownTaskCount: 4,
    totalTaskCount: 7,
    isSearchLoading: false,
    searchError: null,
    onQueryChange: vi.fn(),
    onToggleLabel: vi.fn(),
    onClearLabels: vi.fn(),
    onClearAll: vi.fn(),
    onRetrySearch: vi.fn(),
    ...overrides,
  };

  act(() => root.render(<KanbanFilterToolbar {...props} />));
  return { container, props, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("KanbanFilterToolbar", () => {
  test("exposes search, result count, and keyboard-operable label toggles", () => {
    const onQueryChange = vi.fn();
    const onToggleLabel = vi.fn();
    const { container } = renderToolbar({ onQueryChange, onToggleLabel });
    const search = container.querySelector<HTMLInputElement>("#kanban-task-search");
    const frontend = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Frontend"
    );

    expect(search?.getAttribute("maxlength")).toBe("200");
    expect(container.textContent).toContain("4 / 7 tasks");
    expect(frontend?.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      setInputValue(search!, "launch");
      frontend!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onQueryChange).toHaveBeenCalledWith("launch");
    expect(onToggleLabel).toHaveBeenCalledWith("Frontend");
  });

  test("keeps failure recoverable and exposes clear actions", () => {
    const onRetrySearch = vi.fn();
    const onClearLabels = vi.fn();
    const onClearAll = vi.fn();
    const { container } = renderToolbar({
      query: "launch",
      selectedLabels: new Set(["Urgent"]),
      searchError: "Could not search tasks.",
      onRetrySearch,
      onClearLabels,
      onClearAll,
    });

    const buttonByText = (text: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === text
      );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "previous results are still shown"
    );

    act(() => {
      buttonByText("Retry")!.click();
      buttonByText("Clear labels")!.click();
      buttonByText("Clear all")!.click();
    });

    expect(onRetrySearch).toHaveBeenCalledOnce();
    expect(onClearLabels).toHaveBeenCalledOnce();
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  test("announces loading and renders an empty label collection", () => {
    const onQueryChange = vi.fn();
    const { container } = renderToolbar({
      query: "launch",
      availableLabels: [],
      selectedLabels: new Set(),
      isSearchLoading: true,
      onQueryChange,
    });

    expect(container.textContent).toContain("Updating results");
    expect(container.textContent).toContain("No labels are available yet.");
    expect(container.textContent).toContain('Active: search "launch"');
    const clearSearch = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear task search"]'
    );
    act(() => clearSearch!.click());
    expect(onQueryChange).toHaveBeenCalledWith("");
  });
});
