// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ProductFeedbackDialog } from "@/components/product-feedback-dialog";
import { ToastProvider } from "@/components/toast-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/hooks/use-current-app-path", () => ({
  useCurrentAppPath: () => "/projects/project-1?taskId=task-7",
}));

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

async function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("product feedback dialog", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ delivery: "sent" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("submits a labeled feedback report without optional diagnostics", async () => {
    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      <ToastProvider>
        <ProductFeedbackDialog triggerVariant="desktop" />
      </ToastProvider>
    );

    await click(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Report a bug or feedback")
      ) ?? null
    );

    const dialog = document.body.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.textContent).toContain("Report a bug or share feedback");
    expect(dialog?.textContent).toContain("No page content, cookies, or form data.");

    const feedbackRadio = document.body.querySelector<HTMLInputElement>(
      "input[type='radio'][value='feedback']"
    );
    await click(feedbackRadio);
    const diagnosticsCheckbox = document.body.querySelector<HTMLInputElement>(
      "input[type='checkbox']"
    );
    await click(diagnosticsCheckbox);
    const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    await setTextareaValue(
      textarea as HTMLTextAreaElement,
      "A compact roadmap view would help on mobile."
    );

    const form = document.body.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
      })
    );
    const fetchOptions = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(fetchOptions?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      reportType: "feedback",
      message: "A compact roadmap view would help on mobile.",
      pagePath: "/projects/project-1?taskId=task-7",
      diagnostics: null,
    });
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(document.body.textContent).toContain(
      "Thanks—your report was sent to the NexusDash team."
    );

    await act(async () => root.unmount());
  });

  test("preserves the message and announces delivery failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "delivery-failed" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    );
    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      <ToastProvider>
        <ProductFeedbackDialog triggerVariant="mobile" />
      </ToastProvider>
    );
    await click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Feedback"
      ) ?? null
    );
    const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");
    await setTextareaValue(
      textarea as HTMLTextAreaElement,
      "The task dialog closes unexpectedly."
    );

    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.querySelector("[role='alert']")?.textContent).toContain(
      "Your message is still here"
    );
    expect(
      document.body.querySelector<HTMLTextAreaElement>("textarea")?.value
    ).toBe("The task dialog closes unexpectedly.");

    await act(async () => root.unmount());
  });
});
