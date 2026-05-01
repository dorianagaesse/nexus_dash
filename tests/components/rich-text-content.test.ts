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

  test("enhances code and token blocks into copyable confidential surfaces", () => {
    setClipboard({
      writeText: vi.fn().mockResolvedValue(undefined),
    });

    const input = [
      createRichTextCodeBlock("npm run lint"),
      createRichTextTokenBlock("1234567890abcdefghijklmnopqrstuvwxyz", "Access token"),
    ].join("");

    const output = buildEnhancedRichTextHtml(input);

    expect(output).toContain("Copy code block");
    expect(output).toContain("Copy token value");
    expect(output).toContain("Reveal token value");
    expect(output).toContain("********");
  });

  test("marks mentions for hover-card lookup", () => {
    const output = buildEnhancedRichTextHtml("<p>Hello @alice#1234</p>");

    expect(output).toContain('data-rich-mention="true"');
    expect(output).toContain('data-mention-username="alice"');
    expect(output).toContain('data-mention-discriminator="1234"');
  });

  test("shows a user hover card for rich-text mentions", async () => {
    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: "<p>Hello @alice#1234</p>",
        mentionUsers: [
          {
            id: "user-alice",
            displayName: "Alice Example",
            usernameTag: "alice#1234",
            avatarSeed: "user-alice",
          },
        ],
      })
    );

    const mention = container.querySelector<HTMLElement>("[data-rich-mention='true']");
    expect(mention).not.toBeNull();

    await act(async () => {
      mention?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Alice Example");
    expect(document.body.textContent).toContain("alice#1234");

    await act(async () => {
      root.unmount();
    });
  });

  test("copies structured code content through the clipboard API", async () => {
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
      'button[aria-label="Copy code block"]'
    );
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("npm run lint");
    expect(copyButton?.getAttribute("title")).toBe("Copied");

    await act(async () => {
      root.unmount();
    });
  });

  test("reveals and hides token values on demand", async () => {
    setClipboard({
      writeText: vi.fn().mockResolvedValue(undefined),
    });

    const { container, root } = createTestRenderer();
    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: createRichTextTokenBlock("abcdef", "API key"),
      })
    );

    const toggleButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reveal token value"]'
    );
    const tokenValue = container.querySelector<HTMLElement>("code[data-rich-token-value]");

    expect(toggleButton).not.toBeNull();
    expect(tokenValue?.textContent).toBe("********");

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(tokenValue?.textContent).toBe("abcdef");

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(tokenValue?.textContent).toBe("********");

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
        html: createRichTextTokenBlock("abcdef", "API key"),
      })
    );

    expect(container.querySelector("button[data-rich-copy-text]")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
