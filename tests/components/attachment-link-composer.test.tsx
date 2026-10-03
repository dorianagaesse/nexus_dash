// @vitest-environment jsdom

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AttachmentLinkComposer } from "@/components/ui/attachment-link-composer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
  initialValue = "",
  onSubmit,
  isSubmitDisabled,
  autoConfirmOnBlur,
  autoConfirmOnPaste,
}: {
  initialValue?: string;
  onSubmit: (url?: string) => void | Promise<void>;
  isSubmitDisabled?: boolean;
  autoConfirmOnBlur?: boolean;
  autoConfirmOnPaste?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <AttachmentLinkComposer
      value={value}
      onValueChange={setValue}
      onSubmit={onSubmit}
      isSubmitDisabled={isSubmitDisabled}
      autoConfirmOnBlur={autoConfirmOnBlur}
      autoConfirmOnPaste={autoConfirmOnPaste}
    />
  );
}

describe("AttachmentLinkComposer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("auto-confirms a valid URL on blur without secondary tap (ND-140 AC1)", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<Harness initialValue="https://example.com/spec" onSubmit={onSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();

    // Focus and blur input
    await act(async () => {
      input.focus();
      input.blur();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("https://example.com/spec");
  });

  test("auto-confirms a valid URL on Enter (ND-140 AC1)", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<Harness initialValue="https://nexus-dash.app" onSubmit={onSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("https://nexus-dash.app/");
  });

  test("auto-confirms a valid URL on paste (ND-140 AC1)", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<Harness initialValue="" onSubmit={onSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          getData: (type: string) => (type === "text" ? "https://example.com/pasted-doc" : ""),
        },
      });
      input.dispatchEvent(pasteEvent);
    });

    expect(onSubmit).toHaveBeenCalledWith("https://example.com/pasted-doc");
  });

  test("does not auto-confirm on blur when focus moves to explicit '+' button (avoids double submit)", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<Harness initialValue="https://example.com/link" onSubmit={onSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    const button = container.querySelector("button") as HTMLButtonElement;

    // Blur where relatedTarget is the add button
    await act(async () => {
      input.dispatchEvent(
        new FocusEvent("blur", { bubbles: true, relatedTarget: button })
      );
    });

    expect(onSubmit).not.toHaveBeenCalled();

    // Clicking the explicit '+' button triggers submit
    await act(async () => {
      button.click();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("https://example.com/link");
  });

  test("does not auto-confirm invalid URLs on blur", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<Harness initialValue="not-a-valid-url" onSubmit={onSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("fits sheet width with mobile-tightened flex classes (ND-140 AC3)", async () => {
    await act(async () => {
      root.render(<Harness initialValue="" onSubmit={vi.fn()} />);
    });

    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain("w-full");
    expect(outerDiv.className).toContain("min-w-0");
    expect(outerDiv.className).toContain("max-w-full");

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.className).toContain("min-w-0");
    expect(input.className).toContain("flex-1");

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("shrink-0");
  });
});
