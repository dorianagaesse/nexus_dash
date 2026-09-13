// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SegmentedControl } from "@/components/ui/segmented-control";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type ListView = "active" | "archived";

const OPTIONS = [
  { value: "active" as const, label: "Active (2)" },
  { value: "archived" as const, label: "Archived (1)" },
];

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function renderSegmentedControl(
  root: Root,
  props: Partial<React.ComponentProps<typeof SegmentedControl<ListView>>> = {}
) {
  await act(async () => {
    root.render(
      React.createElement(SegmentedControl<ListView>, {
        value: "active",
        options: OPTIONS,
        onValueChange: () => {},
        ariaLabel: "Epic list view",
        ...props,
      })
    );
  });
}

describe("ui/segmented-control", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("marks the selected option and reports switches", async () => {
    const onValueChange = vi.fn();
    const { container, root } = createTestRenderer();
    await renderSegmentedControl(root, { onValueChange });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Active (2)",
      "Archived (1)",
    ]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith("archived");

    await act(async () => {
      root.unmount();
    });
  });

  test("group carries the accessible name and one column per option", async () => {
    const { container, root } = createTestRenderer();
    await renderSegmentedControl(root);

    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe("Epic list view");
    expect(group.style.gridTemplateColumns).toBe(
      "repeat(2, minmax(0, 1fr))"
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("reflects an externally selected value", async () => {
    const { container, root } = createTestRenderer();
    await renderSegmentedControl(root, { value: "archived" });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      root.unmount();
    });
  });
});
