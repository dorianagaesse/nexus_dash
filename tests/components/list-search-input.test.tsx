// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ListSearchInput } from "@/components/ui/list-search-input";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
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

function renderSearchInput(
  root: Root,
  props: Partial<React.ComponentProps<typeof ListSearchInput>> = {}
) {
  return renderWithRoot(
    root,
    React.createElement(ListSearchInput, {
      value: "",
      onValueChange: () => {},
      placeholder: "Search epics by name or description",
      ariaLabel: "Search epics",
      clearAriaLabel: "Clear epic search",
      ...props,
    })
  );
}

describe("ui/list-search-input", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("reports every typed value through onValueChange", async () => {
    const onValueChange = vi.fn();
    const { container, root } = createTestRenderer();
    await renderSearchInput(root, { onValueChange, value: "launch" });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("launch");

    await act(async () => {
      setInputValue(input, "launch beta");
    });

    expect(onValueChange).toHaveBeenCalledWith("launch beta");

    await act(async () => {
      root.unmount();
    });
  });

  test("exposes the accessible name and placeholder for the field", async () => {
    const { container, root } = createTestRenderer();
    await renderSearchInput(root);

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("Search epics");
    expect(input.getAttribute("placeholder")).toBe(
      "Search epics by name or description"
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("only shows the clear button while a value is present", async () => {
    const onValueChange = vi.fn();
    const { container, root } = createTestRenderer();
    await renderSearchInput(root, { onValueChange });

    expect(container.querySelector("button")).toBeNull();

    await act(async () => {
      root.render(
        React.createElement(ListSearchInput, {
          value: "launch",
          onValueChange,
          placeholder: "Search epics by name or description",
          ariaLabel: "Search epics",
          clearAriaLabel: "Clear epic search",
        })
      );
    });

    const clearButton = container.querySelector("button");
    expect(clearButton?.getAttribute("aria-label")).toBe("Clear epic search");

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith("");

    await act(async () => {
      root.unmount();
    });
  });
});
