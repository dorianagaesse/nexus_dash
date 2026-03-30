// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/emoji-field", () => ({
  EmojiFieldShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

import {
  buildEditorRichTextHtml,
  RichTextEditor,
  serializeEditorRichTextHtml,
} from "@/components/rich-text-editor";
import {
  createRichTextCodeBlock,
  createRichTextTokenBlock,
} from "@/lib/rich-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EDITOR_RICH_SHELL_SELECTOR = "nd-rich-shell[data-editor-shell]";

function getTemplate(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
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

function selectTextPosition(node: Node, offset: number) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectionIsAtEndOfStructuredField(fieldElement: HTMLElement | null) {
  if (fieldElement instanceof HTMLInputElement) {
    return (
      document.activeElement === fieldElement &&
      fieldElement.selectionStart === fieldElement.value.length &&
      fieldElement.selectionEnd === fieldElement.value.length
    );
  }

  const selection = window.getSelection();

  if (!selection?.anchorNode || !fieldElement?.contains(selection.anchorNode)) {
    return false;
  }

  if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    return selection.anchorOffset === (selection.anchorNode.textContent?.length ?? 0);
  }

  return (
    selection.anchorNode === fieldElement &&
    selection.anchorOffset === fieldElement.childNodes.length
  );
}

async function expectEnterFromTrailingParagraphToMoveIntoBlockEnd(
  initialValue: string,
  expectedPersistentValue: string,
  expectedActionSelector: string
) {
  const { container, root } = createTestRenderer();

  await renderWithRoot(
    root,
    React.createElement(EditorHarness, {
      initialValue,
    })
  );

  const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
  const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

  expect(editor).not.toBeNull();
  expect(trailingParagraph?.tagName).toBe("P");

  selectTextPosition((trailingParagraph?.firstChild as Node) ?? (trailingParagraph as Node), 0);

  await act(async () => {
    editor?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
    );
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  const selection = window.getSelection();
  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
  const fieldElement =
    (editor?.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} input[data-editor-token-input="true"]`
    ) as HTMLElement | null) ??
    (editor?.querySelector(`${EDITOR_RICH_SHELL_SELECTOR} code`) as HTMLElement | null);

  expect(selection).not.toBeNull();
  expect(selectionIsAtEndOfStructuredField(fieldElement)).toBe(true);
  expect(persistedValue).toBe(expectedPersistentValue);
  expect(container.querySelector(expectedActionSelector)).not.toBeNull();

  await act(async () => {
    root.unmount();
  });
}

function EditorHarness({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);

  return React.createElement(
    "div",
    null,
    React.createElement(RichTextEditor, {
      id: "test-editor",
      value,
      onChange: setValue,
    }),
    React.createElement("output", { "data-testid": "value" }, value)
  );
}

describe("rich-text-editor", () => {
  test("keeps a trailing paragraph after a terminal code block", () => {
    const html = buildEditorRichTextHtml(createRichTextCodeBlock("npm run lint") ?? "");
    const template = getTemplate(html);

    expect(template.content.lastElementChild?.tagName).toBe("P");
    expect(template.content.lastElementChild?.textContent).toBe("\u200B");
  });

  test("keeps a trailing paragraph after a terminal token block", () => {
    const html = buildEditorRichTextHtml(createRichTextTokenBlock("secret-token") ?? "");
    const template = getTemplate(html);

    expect(template.content.lastElementChild?.tagName).toBe("P");
    expect(template.content.lastElementChild?.textContent).toBe("\u200B");
    expect(
      template.content.querySelector(EDITOR_RICH_SHELL_SELECTOR)?.getAttribute("contenteditable")
    ).toBe("false");
  });

  test("serializes editor shells back to canonical structured rich text", () => {
    const enhancedHtml = buildEditorRichTextHtml(
      [
        createRichTextCodeBlock("npm run lint"),
        createRichTextTokenBlock("secret-token"),
      ].join("") ?? ""
    );

    const serializedHtml = serializeEditorRichTextHtml(enhancedHtml);

    expect(serializedHtml).not.toContain("nd-rich-shell");
    expect(serializedHtml).not.toContain("data-editor-actions");
    expect(serializedHtml).toContain('<pre data-rich-block="code"><code>npm run lint</code></pre>');
    expect(serializedHtml).toContain(
      '<div data-rich-block="token"><code>secret-token</code></div>'
    );
  });

  test("wraps only the current visual line in a code block when there is no selection", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, { initialValue: "<p>text1<br />text2</p>" })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const firstLineTextNode = editor?.querySelector("p")?.firstChild;
    const codeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Code")
    );

    expect(editor).not.toBeNull();
    expect(firstLineTextNode).not.toBeNull();
    expect(codeButton).not.toBeNull();

    selectTextPosition(firstLineTextNode as Node, "text1".length);

    await act(async () => {
      codeButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      codeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(serializedValue).toContain('<pre data-rich-block="code"><code>text1</code></pre>');
    expect(serializedValue).toContain("<p>text2</p>");
    expect(serializedValue).not.toContain('<code>text1\ntext2</code>');

    await act(async () => {
      root.unmount();
    });
  });

  test("moves the caret to the end of a token block when Enter is pressed below it", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectEnterFromTrailingParagraphToMoveIntoBlockEnd(
      initialValue,
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("toggles an active token input back to plain text when Token is clicked again", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;
    const tokenButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Token")
    );

    expect(tokenInput).not.toBeNull();
    expect(tokenButton).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
      tokenButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      tokenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(serializedValue).toContain("<p>secret-token</p>");
    expect(serializedValue).not.toContain('data-rich-block="token"');

    await act(async () => {
      root.unmount();
    });
  });

  test("moves the caret to the end of a code block when Enter is pressed below it", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectEnterFromTrailingParagraphToMoveIntoBlockEnd(
      initialValue,
      initialValue,
      'button[aria-label="Copy code block"]'
    );
  });

  test("restores token controls when a transient input mutation happens during trailing token navigation", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(editor).not.toBeNull();
    expect(trailingParagraph?.tagName).toBe("P");

    selectTextPosition((trailingParagraph?.firstChild as Node) ?? (trailingParagraph as Node), 0);

    await act(async () => {
      editor?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      );
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const tokenValue = editor?.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;
    const tokenActions = editor?.querySelector('[data-editor-actions="true"]');

    if (tokenValue) {
      tokenValue.value = "secret-token*";
      tokenValue.setAttribute("value", "secret-token*");
    }

    tokenActions?.remove();

    const inputEvent = new InputEvent("input", {
      bubbles: true,
    });

    await act(async () => {
      editor?.dispatchEvent(inputEvent);
    });

    const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(persistedValue).toBe(initialValue);
    expect(container.querySelector('button[aria-label="Reveal token value"]')).not.toBeNull();
    expect(
      (editor?.querySelector('input[data-editor-token-input="true"]') as HTMLInputElement | null)
        ?.value
    ).toBe("secret-token");

    await act(async () => {
      root.unmount();
    });
  });
});
