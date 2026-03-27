// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildEnhancedRichTextHtml,
  RichTextContent,
} from "@/components/rich-text-content";
import {
  createRichTextCodeBlock,
  createRichTextTokenBlock,
} from "@/lib/rich-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setClipboard(
  clipboard:
    | {
        writeText: ReturnType<typeof vi.fn>;
      }
    | undefined
) {
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

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
  setClipboard(undefined);
  vi.restoreAllMocks();
});

describe("rich-text-content", () => {
  test("leaves plain rich text unchanged when no structured blocks are present", () => {
    setClipboard({
      writeText: vi.fn().mockResolvedValue(undefined),
    });

    expect(buildEnhancedRichTextHtml("<p>Hello team</p>")).toBe("<p>Hello team</p>");
  });

  test("enhances code and token blocks into copyable rich surfaces", () => {
    setClipboard({
      writeText: vi.fn().mockResolvedValue(undefined),
    });

    const input = [
      createRichTextCodeBlock("npm run lint"),
      createRichTextTokenBlock(
        "Access token",
        "1234567890abcdefghijklmnopqrstuvwxyz"
      ),
    ].join("");

    const output = buildEnhancedRichTextHtml(input);

    expect(output).toContain("Copy code or command block");
    expect(output).toContain("Copy Access token");
    expect(output).toContain("1234567890abcdef...qrstuvwxyz");
  });

  test("copies structured content through the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: createRichTextCodeBlock("npm run lint"),
      })
    );

    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy code or command block"]'
    );
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("npm run lint");
    expect(copyButton?.textContent).toBe("Copied");

    await act(async () => {
      root.unmount();
    });
  });

  test("omits copy controls when the clipboard API is unavailable", async () => {
    setClipboard(undefined);

    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: createRichTextTokenBlock("API key", "abcdef"),
      })
    );

    expect(container.querySelector("button[data-rich-copy-text]")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
