// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("calendar-date-time-field", () => {
  test("renders the picker popover through a body portal", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(CalendarDateTimeField, {
        id: "calendar-date",
        value: "2026-04-17",
        onChange: vi.fn(),
        includeTime: false,
        disabled: false,
      })
    );

    const trigger = container.querySelector<HTMLButtonElement>("#calendar-date");
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("[data-calendar-popover='true']")).toBeNull();
    expect(document.body.querySelector("[data-calendar-popover='true']")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("closes the portaled popover on outside click", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(CalendarDateTimeField, {
        id: "calendar-date",
        value: "2026-04-17",
        onChange: vi.fn(),
        includeTime: false,
        disabled: false,
      })
    );

    const trigger = container.querySelector<HTMLButtonElement>("#calendar-date");
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.querySelector("[data-calendar-popover='true']")).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(document.body.querySelector("[data-calendar-popover='true']")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
