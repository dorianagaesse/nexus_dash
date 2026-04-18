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

  test("repositions the portaled popover when the viewport changes", async () => {
    const { container, root } = createTestRenderer();
    let triggerLeft = 100;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

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

    vi.spyOn(trigger as HTMLButtonElement, "getBoundingClientRect").mockImplementation(() => ({
      x: triggerLeft,
      y: 200,
      left: triggerLeft,
      top: 200,
      right: triggerLeft + 240,
      bottom: 240,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    }));

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const popover = document.body.querySelector<HTMLElement>("[data-calendar-popover='true']");
    expect(popover).not.toBeNull();
    expect(popover?.style.left).toBe("100px");

    triggerLeft = 180;

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(popover?.style.left).toBe("180px");

    await act(async () => {
      root.unmount();
    });
  });
  test("closes on outside click even when an ancestor stops mousedown propagation", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(
        "div",
        {
          onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation(),
        },
        React.createElement(CalendarDateTimeField, {
          id: "calendar-date",
          value: "2026-04-17",
          onChange: vi.fn(),
          includeTime: false,
          disabled: false,
        }),
        React.createElement("button", { type: "button", "data-outside-target": "true" }, "Outside")
      )
    );

    const trigger = container.querySelector<HTMLButtonElement>("#calendar-date");
    const outsideTarget = container.querySelector<HTMLButtonElement>(
      "[data-outside-target='true']"
    );
    expect(trigger).not.toBeNull();
    expect(outsideTarget).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.querySelector("[data-calendar-popover='true']")).not.toBeNull();

    await act(async () => {
      outsideTarget?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(document.body.querySelector("[data-calendar-popover='true']")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("opens above the trigger when there is not enough space below", async () => {
    const { container, root } = createTestRenderer();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

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

    vi.spyOn(trigger as HTMLButtonElement, "getBoundingClientRect").mockImplementation(() => ({
      x: 100,
      y: 700,
      left: 100,
      top: 700,
      right: 340,
      bottom: 740,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    }));

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const popover = document.body.querySelector<HTMLElement>("[data-calendar-popover='true']");
    expect(popover).not.toBeNull();
    expect(popover?.style.top).toBe("");
    expect(popover?.style.bottom).toBe("104px");

    await act(async () => {
      root.unmount();
    });
  });

  test("opens above the trigger when a modal footer boundary leaves insufficient room below", async () => {
    const { container, root } = createTestRenderer();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    await renderWithRoot(
      root,
      React.createElement(
        "div",
        { "data-calendar-popover-scope": "true" },
        React.createElement(CalendarDateTimeField, {
          id: "calendar-date",
          value: "2026-04-17",
          onChange: vi.fn(),
          includeTime: false,
          disabled: false,
        }),
        React.createElement("div", { "data-calendar-popover-footer-boundary": "true" })
      )
    );

    const trigger = container.querySelector<HTMLButtonElement>("#calendar-date");
    const footerBoundary = container.querySelector<HTMLElement>(
      "[data-calendar-popover-footer-boundary='true']"
    );
    expect(trigger).not.toBeNull();
    expect(footerBoundary).not.toBeNull();

    vi.spyOn(trigger as HTMLButtonElement, "getBoundingClientRect").mockImplementation(() => ({
      x: 100,
      y: 400,
      left: 100,
      top: 400,
      right: 340,
      bottom: 440,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    }));
    vi.spyOn(footerBoundary as HTMLElement, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 520,
      left: 0,
      top: 520,
      right: 900,
      bottom: 600,
      width: 900,
      height: 80,
      toJSON: () => ({}),
    }));

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const popover = document.body.querySelector<HTMLElement>("[data-calendar-popover='true']");
    expect(popover).not.toBeNull();
    expect(popover?.style.top).toBe("");
    expect(popover?.style.bottom).toBe("404px");

    await act(async () => {
      root.unmount();
    });
  });
});
