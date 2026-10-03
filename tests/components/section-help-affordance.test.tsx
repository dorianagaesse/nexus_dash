// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SectionHelpAffordance } from "@/components/project-dashboard/section-help-affordance";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SectionHelpAffordance", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("renders opt-in help button with question mark and accessible attributes (ND-143 AC1)", async () => {
    await act(async () => {
      root.render(
        <SectionHelpAffordance
          title="Test Guide"
          description="A quick overview"
          ariaLabel="Test help"
        >
          <p>Guide body content</p>
        </SectionHelpAffordance>
      );
    });

    const trigger = container.querySelector("button[aria-label='Test help']");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();
  });

  test("toggles popover guide open and closed via button click (ND-143 AC1)", async () => {
    await act(async () => {
      root.render(
        <SectionHelpAffordance
          title="Roadmap guide"
          description="Milestones and events"
          ariaLabel="Roadmap help"
        >
          <p>Guide explanation goes here</p>
        </SectionHelpAffordance>
      );
    });

    const trigger = container.querySelector("button[aria-label='Roadmap help']") as HTMLButtonElement;
    expect(trigger).not.toBeNull();

    // Click to open
    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const popover = document.querySelector("[data-section-help-popover='true']");
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("Roadmap guide");
    expect(popover?.textContent).toContain("Milestones and events");
    expect(popover?.textContent).toContain("Guide explanation goes here");

    // Click trigger again to close
    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();
  });

  test("closes popover guide when close button is clicked", async () => {
    await act(async () => {
      root.render(
        <SectionHelpAffordance title="Roadmap guide">
          <p>Explanation</p>
        </SectionHelpAffordance>
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    expect(document.querySelector("[data-section-help-popover='true']")).not.toBeNull();

    const closeButton = document.querySelector("button[aria-label='Close help']") as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    await act(async () => {
      closeButton.click();
    });

    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("closes popover guide on Escape key", async () => {
    await act(async () => {
      root.render(
        <SectionHelpAffordance title="Roadmap guide">
          <p>Explanation</p>
        </SectionHelpAffordance>
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    expect(document.querySelector("[data-section-help-popover='true']")).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();
  });

  test("closes popover guide on pointer down outside", async () => {
    await act(async () => {
      root.render(
        <SectionHelpAffordance title="Roadmap guide">
          <p>Explanation</p>
        </SectionHelpAffordance>
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    expect(document.querySelector("[data-section-help-popover='true']")).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(document.querySelector("[data-section-help-popover='true']")).toBeNull();
  });
});
