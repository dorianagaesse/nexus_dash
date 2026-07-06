// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function DialogHarness({ dismissible = true }: { dismissible?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <div>
      <button type="button" data-testid="background-action">
        Background action
      </button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button type="button">Open dialog</Button>
        </DialogTrigger>
        <DialogContent
          aria-describedby={undefined}
          dismissible={dismissible}
          className="max-w-md"
        >
          <DialogTitle>Accessible settings</DialogTitle>
          <input aria-label="Project name" defaultValue="Apollo" />
          <button type="button" onClick={() => setIsPopoverOpen(true)}>
            Open options
          </button>
          <button type="button">Last action</button>
          {isPopoverOpen
            ? createPortal(
                <button
                  type="button"
                  data-overlay-popover="true"
                  onClick={() => setIsPopoverOpen(false)}
                >
                  Nested option
                </button>,
                document.body
              )
            : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("accessible dialog foundation", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("provides modal semantics, isolates focus, and restores the trigger after Escape", async () => {
    const { container, root } = createTestRenderer();
    await renderWithRoot(root, <DialogHarness />);

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open dialog"
    );
    await click(trigger ?? null);

    const dialog = document.body.querySelector<HTMLElement>("[role='dialog']");
    const titleId = dialog?.getAttribute("aria-labelledby");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? "")?.textContent).toBe("Accessible settings");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    expect(dialog?.contains(document.activeElement)).toBe(true);

    const backgroundAction = container.querySelector<HTMLElement>(
      "[data-testid='background-action']"
    );
    await act(async () => {
      backgroundAction?.focus();
    });
    expect(dialog?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    await expect.poll(() => document.activeElement === trigger).toBe(true);

    await act(async () => root.unmount());
  });

  test("keeps in-flight dialogs open on Escape and accepts marked nested controls", async () => {
    const { container, root } = createTestRenderer();
    await renderWithRoot(root, <DialogHarness dismissible={false} />);

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open dialog"
    );
    await click(trigger ?? null);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();

    const openOptions = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Open options"
    );
    await click(openOptions ?? null);
    const nestedOption = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Nested option"
    );
    await click(nestedOption ?? null);
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();

    await act(async () => root.unmount());
  });
});
