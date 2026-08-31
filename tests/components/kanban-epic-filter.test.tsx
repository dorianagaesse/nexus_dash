// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { KanbanEpicFilter } from "@/components/kanban/kanban-epic-filter";
import { NO_EPIC_FILTER_VALUE } from "@/components/kanban/kanban-epic-filter-utils";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const epics = [
  {
    id: "epic-a",
    name: "Alpha launch",
    status: "In progress" as const,
    progressPercent: 50,
    taskCount: 2,
  },
  {
    id: "epic-b",
    name: "Beta readiness",
    status: "Ready" as const,
    progressPercent: 0,
    taskCount: 1,
  },
];

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderWithRoot(root: Root, ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

function click(button: HTMLButtonElement) {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function Harness({ onClearAll }: { onClearAll: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const clear = () => setSelected(new Set());

  return (
    <KanbanEpicFilter
      epics={epics}
      selectedEpicFilters={selected}
      shownTaskCount={selected.size > 0 ? 2 : 5}
      totalTaskCount={5}
      onToggleEpic={(value) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(value)) {
            next.delete(value);
          } else {
            next.add(value);
          }
          return next;
        })
      }
      onClearEpics={clear}
      onClearAll={() => {
        onClearAll();
        clear();
      }}
    />
  );
}

describe("KanbanEpicFilter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders all Epics, No epic, result status, and disabled clear actions", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(root, <Harness onClearAll={vi.fn()} />);

    expect(container.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "kanban-epic-filter-title"
    );
    expect(
      container.querySelector('[role="group"]')?.getAttribute("aria-label")
    ).toBe("Epic filters");
    expect(container.querySelectorAll('button[aria-pressed="false"]')).toHaveLength(
      3
    );
    expect(container.textContent).toContain("Alpha launch");
    expect(container.textContent).toContain("Beta readiness");
    expect(container.textContent).toContain("No epic");
    expect(container.textContent).toContain("5 / 5 tasks shown");
    expect(container.querySelector("output")?.getAttribute("aria-live")).toBe(
      "polite"
    );
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        (button) => button.disabled
      )
    ).toHaveLength(2);

    await act(async () => root.unmount());
  });

  test("supports multi-selection, semantic state, clear Epics, and clear all", async () => {
    const clearAll = vi.fn();
    const { container, root } = createTestRenderer();
    await renderWithRoot(root, <Harness onClearAll={clearAll} />);

    const alpha = container.querySelector(
      'button[aria-label="Filter tasks by Epic: Alpha launch"]'
    ) as HTMLButtonElement;
    const noEpic = container.querySelector(
      'button[aria-label="Filter tasks by Epic: No epic"]'
    ) as HTMLButtonElement;

    await act(async () => {
      click(alpha);
    });
    await act(async () => {
      click(noEpic);
    });

    expect(alpha.getAttribute("aria-pressed")).toBe("true");
    expect(noEpic.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("2 Epic filters active");
    expect(container.textContent).toContain("2 / 5 tasks shown");
    expect(alpha.className).toContain("min-h-11");

    const clearEpics = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Clear Epics")
    ) as HTMLButtonElement;
    await act(async () => {
      click(clearEpics);
    });
    expect(alpha.getAttribute("aria-pressed")).toBe("false");
    expect(noEpic.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      click(noEpic);
    });
    expect(noEpic.getAttribute("aria-pressed")).toBe("true");
    expect(NO_EPIC_FILTER_VALUE).toContain("no_epic");

    const clearAllButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Clear all filters")
    ) as HTMLButtonElement;
    await act(async () => {
      click(clearAllButton);
    });
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(noEpic.getAttribute("aria-pressed")).toBe("false");

    await act(async () => root.unmount());
  });
});

