// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildEnhancedRichTextHtml,
  RichTextContent,
} from "@/components/rich-text-content";
import { renderContentWithMentions } from "@/lib/content-with-mentions";
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
    const template = document.createElement("template");
    template.innerHTML = output;
    const mention = template.content.querySelector("[data-rich-mention='true']");

    expect(output).toContain('data-rich-mention="true"');
    expect(output).toContain('data-mention-username="alice"');
    expect(output).toContain('data-mention-discriminator="1234"');
    expect(mention?.textContent).toBe("@alice");
  });

  test("marks mentions in coerced task description text after edits", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: "test @dorian2#6425 dedede\nedit 1",
        mentionUsers: [
          {
            id: "user-dorian",
            displayName: "Dorian Two",
            usernameTag: "dorian2#6425",
            avatarSeed: "user-dorian",
          },
        ],
      })
    );

    const mention = container.querySelector<HTMLElement>("[data-rich-mention='true']");
    expect(mention?.textContent).toBe("@dorian2");
    expect(mention?.dataset.mentionDiscriminator).toBe("6425");
    expect(container.textContent).not.toContain("@dorian2#6425");

    await act(async () => {
      root.unmount();
    });
  });

  test("marks task description mentions split by invisible editor format characters", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: "<p>mention 1 @\u200Bdorianagaesse\u200B#\u20602209 dd<br />mention 2 @dorianagaesse#2209</p>",
        mentionUsers: [
          {
            id: "user-dorian",
            displayName: "Dorian",
            usernameTag: "dorianagaesse#2209",
            avatarSeed: "user-dorian",
          },
        ],
      })
    );

    const mentions = Array.from(
      container.querySelectorAll<HTMLElement>("[data-rich-mention='true']")
    );
    expect(mentions.map((mention) => mention.textContent)).toEqual([
      "@dorianagaesse",
      "@dorianagaesse",
    ]);
    expect(
      mentions.map((mention) => mention.dataset.mentionDiscriminator)
    ).toEqual(["2209", "2209"]);
    expect(container.textContent).not.toContain("@dorianagaesse#2209");

    await act(async () => {
      root.unmount();
    });
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
      container
        .querySelector("div")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("Alice Example");

    await act(async () => {
      root.unmount();
    });
  });

  test("hides a rich-text mention hover card when the pointer leaves the mention", async () => {
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
    vi.spyOn(mention as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 10,
      top: 10,
      right: 110,
      bottom: 30,
      left: 10,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    });

    await act(async () => {
      mention?.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        })
      );
    });

    expect(document.body.textContent).toContain("Alice Example");

    const activeMention = container.querySelector<HTMLElement>(
      "[data-rich-mention='true']"
    );
    expect(activeMention).not.toBeNull();
    vi.spyOn(activeMention as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 10,
      top: 10,
      right: 110,
      bottom: 30,
      left: 10,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    });

    await act(async () => {
      activeMention?.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 20,
          clientY: 46,
        })
      );
    });

    expect(document.body.textContent).not.toContain("Alice Example");

    await act(async () => {
      root.unmount();
    });
  });

  test("hides a rich-text mention hover card on document pointer movement outside the mention", async () => {
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
    const mentionRect = {
      x: 10,
      y: 10,
      top: 10,
      right: 110,
      bottom: 30,
      left: 10,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(mention as HTMLElement, "getBoundingClientRect").mockReturnValue(
      mentionRect
    );
    vi.spyOn(mention as HTMLElement, "getClientRects").mockReturnValue([
      mentionRect,
    ] as unknown as DOMRectList);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => container),
    });

    await act(async () => {
      mention?.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        })
      );
    });

    expect(document.body.textContent).toContain("Alice Example");

    await act(async () => {
      document.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 20,
          clientY: 46,
        })
      );
    });

    expect(document.body.textContent).not.toContain("Alice Example");

    await act(async () => {
      root.unmount();
    });
  });

  test("enhances mentions immediately after mounted rich text updates", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: "<p>No mention yet</p>",
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

    expect(container.querySelector("[data-rich-mention='true']")).toBeNull();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: "Hello @alice#1234 after edit",
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
    expect(mention?.textContent).toBe("@alice");
    expect(mention?.dataset.mentionDiscriminator).toBe("1234");

    await act(async () => {
      root.unmount();
    });
  });

  test("can preserve full mention text for transparent textarea mirrors", () => {
    const { container, root } = createTestRenderer();

    act(() => {
      root.render(
        React.createElement(
          "div",
          null,
          renderContentWithMentions("@alice#1234 hello", {
            preserveMentionText: true,
            resolveDisplayUsers: false,
          })
        )
      );
    });

    expect(container.textContent).toBe("@alice#1234 hello");

    act(() => {
      root.unmount();
    });
  });

  test("can hide mention discriminators from transparent textarea mirrors", () => {
    const { container, root } = createTestRenderer();

    act(() => {
      root.render(
        React.createElement(
          "div",
          null,
          renderContentWithMentions("@alice#1234 hello", {
            hideMentionDiscriminator: true,
            resolveDisplayUsers: false,
          })
        )
      );
    });

    const mention = container.querySelector("span:not([aria-hidden='true'])");
    const hiddenDiscriminator = container.querySelector("[aria-hidden='true']");
    expect(mention?.textContent).toBe("@alice");
    expect(hiddenDiscriminator?.textContent).toBe("#1234");
    expect(hiddenDiscriminator?.className).toContain("hidden");
    expect(mention?.contains(hiddenDiscriminator)).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  test("highlights every task-description mention after repeated edits", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: [
          "<p>sdrefgtzf @dorian2#6425 fegrfer</p>",
          "<p>another mention @dorian2#6425 dfzedez</p>",
          "<p>fgfrez @dorian2#6425 dezdez</p>",
        ].join(""),
        mentionUsers: [
          {
            id: "user-dorian",
            displayName: "Dorian Two",
            usernameTag: "dorian2#6425",
            avatarSeed: "user-dorian",
          },
        ],
      })
    );

    const mentions = Array.from(
      container.querySelectorAll<HTMLElement>("[data-rich-mention='true']")
    );
    expect(mentions.map((mention) => mention.textContent)).toEqual([
      "@dorian2",
      "@dorian2",
      "@dorian2",
    ]);
    expect(container.textContent).not.toContain("@dorian2#6425");

    await act(async () => {
      root.unmount();
    });
  });

  test("rejoins mention text split by stripped editor artifacts before highlighting", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(RichTextContent, {
        html: '<p>sdrefgtzf @dorian2<span data-editor-mention="true"></span>#6425 fegrfer another mention @dorian2#6425 dfzedez</p>',
        mentionUsers: [
          {
            id: "user-dorian",
            displayName: "Dorian Two",
            usernameTag: "dorian2#6425",
            avatarSeed: "user-dorian",
          },
        ],
      })
    );

    const mentions = Array.from(
      container.querySelectorAll<HTMLElement>("[data-rich-mention='true']")
    );
    expect(mentions.map((mention) => mention.textContent)).toEqual([
      "@dorian2",
      "@dorian2",
    ]);
    expect(container.textContent).not.toContain("@dorian2#6425");

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
