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
const EDITOR_BLOCK_ROW_SELECTOR = "[data-editor-block-row='true']";
const EDITOR_BLOCK_AFTER_ANCHOR_SELECTOR = "[data-editor-block-anchor='after']";

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

function selectNodeStart(node: Node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectNodeOffset(node: Node, offset: number) {
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

function selectionIsAtStartOfElement(element: HTMLElement | null) {
  const selection = window.getSelection();

  if (!selection?.anchorNode || !element?.contains(selection.anchorNode)) {
    return false;
  }

  if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    return selection.anchorOffset === 0;
  }

  return selection.anchorNode === element && selection.anchorOffset === 0;
}

function selectionIsAfterStructuredBlock(rowElement: HTMLElement | null) {
  const afterAnchor = rowElement?.querySelector(
    EDITOR_BLOCK_AFTER_ANCHOR_SELECTOR
  ) as HTMLElement | null;
  const selection = window.getSelection();

  if (!afterAnchor || !selection?.anchorNode || !afterAnchor.contains(selection.anchorNode)) {
    return false;
  }

  if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    return selection.anchorOffset === (selection.anchorNode.textContent?.length ?? 0);
  }

  return (
    selection.anchorNode === afterAnchor &&
    selection.anchorOffset === afterAnchor.childNodes.length
  );
}

function selectAfterStructuredBlock(rowElement: HTMLElement | null) {
  const afterAnchor = rowElement?.querySelector(
    EDITOR_BLOCK_AFTER_ANCHOR_SELECTOR
  ) as HTMLElement | null;

  expect(afterAnchor).not.toBeNull();

  const textNode = afterAnchor?.firstChild;
  if (textNode) {
    selectTextPosition(textNode, textNode.textContent?.length ?? 0);
    return;
  }

  selectNodeOffset(afterAnchor as Node, afterAnchor?.childNodes.length ?? 0);
}

function dispatchKeyDown(
  target: EventTarget | null | undefined,
  options: KeyboardEventInit
) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...options,
  });

  return {
    event,
    notCancelled: target?.dispatchEvent(event) ?? false,
  };
}

function dispatchBeforeInput(target: EventTarget | null | undefined) {
  const event = new Event("beforeinput", {
    bubbles: true,
    cancelable: true,
  });

  return {
    event,
    notCancelled: target?.dispatchEvent(event) ?? false,
  };
}

async function expectEnterBelowBlockToStayBelow(
  initialValue: string,
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

  selectNodeStart(trailingParagraph as Node);

  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
  const { notCancelled } = dispatchKeyDown(editor, { key: "Enter" });

  expect(notCancelled).toBe(true);
  expect(selectionIsAtStartOfElement(trailingParagraph)).toBe(true);
  expect(persistedValue).toBe(initialValue);
  expect(container.querySelector(expectedActionSelector)).not.toBeNull();

  await act(async () => {
    root.unmount();
  });
}

async function expectBackspaceBelowBlockToMoveAfterBlock(
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

  selectNodeStart(trailingParagraph as Node);

  const { notCancelled } = dispatchKeyDown(editor, { key: "Backspace" });
  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
  const blockRow = container
    .querySelector(expectedActionSelector)
    ?.closest(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;

  expect(notCancelled).toBe(false);
  expect(selectionIsAfterStructuredBlock(blockRow)).toBe(true);
  expect(persistedValue).toBe(expectedPersistentValue);
  expect(container.querySelector(expectedActionSelector)).not.toBeNull();

  await act(async () => {
    root.unmount();
  });
}

async function expectBackspaceFromEditorRootBelowBlockToMoveAfterBlock(
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

  expect(editor).not.toBeNull();

  selectNodeOffset(editor as Node, editor?.childNodes.length ?? 0);

  const { notCancelled } = dispatchKeyDown(editor, { key: "Backspace" });
  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
  const blockRow = container
    .querySelector(expectedActionSelector)
    ?.closest(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;

  expect(notCancelled).toBe(false);
  expect(selectionIsAfterStructuredBlock(blockRow)).toBe(true);
  expect(persistedValue).toBe(expectedPersistentValue);
  expect(container.querySelector(expectedActionSelector)).not.toBeNull();

  await act(async () => {
    root.unmount();
  });
}

async function expectBackspaceAfterBlockToRemoveStructuredBlock(
  initialValue: string,
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
  const blockRow = container
    .querySelector(expectedActionSelector)
    ?.closest(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;

  expect(editor).not.toBeNull();
  expect(blockRow).not.toBeNull();

  selectAfterStructuredBlock(blockRow);

  let notCancelled = false;

  await act(async () => {
    ({ notCancelled } = dispatchKeyDown(editor, { key: "Backspace" }));
  });

  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;

  expect(notCancelled).toBe(false);
  expect(persistedValue).toBe("");
  expect(container.querySelector(expectedActionSelector)).toBeNull();
  expect(editor?.innerHTML).toBe("");
  expect(selectionIsAtStartOfElement(editor)).toBe(true);

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

  test("wraps only the current visual line in a token block when there is no selection", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, { initialValue: "<p>token1<br />token2</p>" })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const firstLineTextNode = editor?.querySelector("p")?.firstChild;
    const tokenButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Token")
    );

    expect(editor).not.toBeNull();
    expect(firstLineTextNode).not.toBeNull();
    expect(tokenButton).not.toBeNull();

    selectTextPosition(firstLineTextNode as Node, "token1".length);

    await act(async () => {
      tokenButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      tokenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(serializedValue).toContain('<div data-rich-block="token"><code>token1</code></div>');
    expect(serializedValue).toContain("<p>token2</p>");
    expect(serializedValue).not.toContain('<code>token1 token2</code>');

    await act(async () => {
      root.unmount();
    });
  });

  test("wraps only the first visual line when the editor starts with a bare root text node", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, { initialValue: "" })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Code")
    );

    expect(editor).not.toBeNull();
    expect(codeButton).not.toBeNull();

    await act(async () => {
      if (editor) {
        editor.innerHTML = "text1<div>text2</div><div>text3</div>";
      }
    });

    const firstLineTextNode = Array.from(editor?.childNodes ?? []).find(
      (node) => node.nodeType === Node.TEXT_NODE
    );

    expect(firstLineTextNode).not.toBeNull();

    selectTextPosition(firstLineTextNode as Node, "text1".length);

    await act(async () => {
      codeButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      codeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(serializedValue).toContain('<pre data-rich-block="code"><code>text1</code></pre>');
    expect(serializedValue).toContain("<div>text2</div>");
    expect(serializedValue).toContain("<div>text3</div>");
    expect(serializedValue).not.toContain('<code>text1text2</code>');

    await act(async () => {
      root.unmount();
    });
  });

  test("undoes a code block transform with Ctrl+Z", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, { initialValue: "<p>text1</p><p>text2</p>" })
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

    expect(container.querySelector("output[data-testid='value']")?.textContent).toContain(
      '<pre data-rich-block="code"><code>text1</code></pre>'
    );

    await act(async () => {
      dispatchKeyDown(editor, { key: "z", ctrlKey: true });
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(serializedValue).toBe("<p>text1</p><p>text2</p>");
    expect(
      container.querySelector(`${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"]`)
    ).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("undoes token input edits with Ctrl+Z", async () => {
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

    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
      dispatchBeforeInput(tokenInput);

      if (tokenInput) {
        tokenInput.value = "secret-token-updated";
        tokenInput.setAttribute("value", tokenInput.value);
        tokenInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    expect(container.querySelector("output[data-testid='value']")?.textContent).toContain(
      '<div data-rich-block="token"><code>secret-token-updated</code></div>'
    );

    await act(async () => {
      dispatchKeyDown(tokenInput, { key: "z", ctrlKey: true });
    });

    const serializedValue = container.querySelector("output[data-testid='value']")?.textContent;
    const restoredTokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(serializedValue).toContain('<div data-rich-block="token"><code>secret-token</code></div>');
    expect(restoredTokenInput?.value).toBe("secret-token");

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps Enter below a trailing token block in the paragraph below", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectEnterBelowBlockToStayBelow(initialValue, 'button[aria-label="Reveal token value"]');
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

  test("moves the caret below a token block when Enter is pressed inside the token input", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
      tokenInput?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(document.activeElement).toBe(editor);
    expect(trailingParagraph?.tagName).toBe("P");
    expect(selectionIsAtStartOfElement(trailingParagraph)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves the caret below a token block when Shift+Enter is pressed inside the token input", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
      tokenInput?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter", shiftKey: true })
      );
    });

    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(document.activeElement).toBe(editor);
    expect(trailingParagraph?.tagName).toBe("P");
    expect(selectionIsAtStartOfElement(trailingParagraph)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves into the end of a token value when Left Arrow is pressed from the after-block caret", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenRow = container.querySelector(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenRow).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    selectAfterStructuredBlock(tokenRow);

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowLeft" });
    });

    expect(selectionIsAtEndOfStructuredField(tokenInput)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves to the after-block caret when Right Arrow is pressed at the end of a token value", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenRow = container.querySelector(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenRow).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
      dispatchKeyDown(tokenInput, { key: "ArrowRight" });
    });

    expect(document.activeElement).toBe(editor);
    expect(selectionIsAfterStructuredBlock(tokenRow)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves below a token block when ArrowDown is pressed inside the token input", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;
    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();
    expect(trailingParagraph?.tagName).toBe("P");

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(3, 3);
      dispatchKeyDown(tokenInput, { key: "ArrowDown" });
    });

    expect(document.activeElement).toBe(editor);
    expect(selectionIsAtStartOfElement(trailingParagraph)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("creates a line above a token block when Enter is pressed at the start of the token value", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(0, 0);
      dispatchKeyDown(tokenInput, { key: "Enter" });
    });

    const firstParagraph = editor?.firstElementChild as HTMLParagraphElement | null;
    const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;

    expect(firstParagraph?.tagName).toBe("P");
    expect(selectionIsAtStartOfElement(firstParagraph)).toBe(true);
    expect(persistedValue).toBe(`<p></p>${initialValue}`);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves into a token block when ArrowUp is pressed from the paragraph below", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;
    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();
    expect(trailingParagraph?.tagName).toBe("P");

    selectNodeStart(trailingParagraph as Node);

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowUp" });
    });

    expect(selectionIsAtEndOfStructuredField(tokenInput)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves End inside a token value to the end of the token content", async () => {
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

    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput?.focus();
      tokenInput?.setSelectionRange(0, 0);
      dispatchKeyDown(tokenInput, { key: "End" });
    });

    expect(selectionIsAtEndOfStructuredField(tokenInput)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps Enter below a trailing code block in the paragraph below", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectEnterBelowBlockToStayBelow(initialValue, 'button[aria-label="Copy code block"]');
  });

  test("moves into the end of a code block when Left Arrow is pressed from the after-block caret", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeRow = container.querySelector(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;

    expect(editor).not.toBeNull();
    expect(codeRow).not.toBeNull();
    expect(codeElement).not.toBeNull();

    selectAfterStructuredBlock(codeRow);

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowLeft" });
    });

    expect(selectionIsAtEndOfStructuredField(codeElement)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves to the after-block caret when Right Arrow is pressed at the end of a code block", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeRow = container.querySelector(EDITOR_BLOCK_ROW_SELECTOR) as HTMLElement | null;
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;

    expect(editor).not.toBeNull();
    expect(codeRow).not.toBeNull();
    expect(codeElement).not.toBeNull();

    if (codeElement) {
      selectTextPosition(codeElement.firstChild as Node, codeElement.textContent?.length ?? 0);
    }

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowRight" });
    });

    expect(selectionIsAfterStructuredBlock(codeRow)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves below a code block when ArrowDown is pressed on its last line", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint\nnpm test") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;
    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(editor).not.toBeNull();
    expect(codeElement).not.toBeNull();
    expect(trailingParagraph?.tagName).toBe("P");

    if (codeElement) {
      selectTextPosition(codeElement.firstChild as Node, codeElement.textContent?.length ?? 0);
    }

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowDown" });
    });

    expect(selectionIsAtStartOfElement(trailingParagraph)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("creates a line above a code block when Enter is pressed at the start of the code content", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;

    expect(editor).not.toBeNull();
    expect(codeElement).not.toBeNull();

    if (codeElement?.firstChild) {
      selectTextPosition(codeElement.firstChild, 0);
    }

    await act(async () => {
      dispatchKeyDown(editor, { key: "Enter" });
    });

    const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
    const firstParagraph = editor?.firstElementChild as HTMLParagraphElement | null;

    expect(firstParagraph?.tagName).toBe("P");
    expect(selectionIsAtStartOfElement(firstParagraph)).toBe(true);
    expect(persistedValue).toBe(`<p></p>${initialValue}`);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves into a code block when ArrowUp is pressed from the paragraph below", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;
    const trailingParagraph = editor?.lastElementChild as HTMLParagraphElement | null;

    expect(editor).not.toBeNull();
    expect(codeElement).not.toBeNull();
    expect(trailingParagraph?.tagName).toBe("P");

    selectNodeStart(trailingParagraph as Node);

    await act(async () => {
      dispatchKeyDown(editor, { key: "ArrowUp" });
    });

    expect(selectionIsAtEndOfStructuredField(codeElement)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves End inside a code block to the end of the whole code content", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint\nnpm test") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;
    const firstTextNode = codeElement?.firstChild;

    expect(editor).not.toBeNull();
    expect(codeElement).not.toBeNull();
    expect(firstTextNode).not.toBeNull();

    selectTextPosition(firstTextNode as Node, 0);

    await act(async () => {
      dispatchKeyDown(editor, { key: "End" });
    });

    expect(selectionIsAtEndOfStructuredField(codeElement)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("moves Backspace below a first-line token block to the after-block caret", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectBackspaceBelowBlockToMoveAfterBlock(
      initialValue,
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("moves Backspace from the editor root below a first-line token block to the after-block caret", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectBackspaceFromEditorRootBelowBlockToMoveAfterBlock(
      initialValue,
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("moves Backspace below a first-line code block to the after-block caret", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectBackspaceBelowBlockToMoveAfterBlock(
      initialValue,
      initialValue,
      'button[aria-label="Copy code block"]'
    );
  });

  test("moves Backspace from the editor root below a first-line code block to the after-block caret", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectBackspaceFromEditorRootBelowBlockToMoveAfterBlock(
      initialValue,
      initialValue,
      'button[aria-label="Copy code block"]'
    );
  });

  test("moves Backspace below a trailing token block to the after-block caret", async () => {
    const initialValue = [
      createRichTextCodeBlock("npm run lint"),
      createRichTextTokenBlock("secret-token"),
    ].join("");

    await expectBackspaceBelowBlockToMoveAfterBlock(
      initialValue,
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("removes a first-line token block when Backspace is pressed from the after-block caret", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectBackspaceAfterBlockToRemoveStructuredBlock(
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("removes a first-line code block when Backspace is pressed from the after-block caret", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectBackspaceAfterBlockToRemoveStructuredBlock(
      initialValue,
      'button[aria-label="Copy code block"]'
    );
  });

  test("removes an empty first-line token block on Backspace", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const tokenInput = container.querySelector(
      'input[data-editor-token-input="true"]'
    ) as HTMLInputElement | null;

    expect(editor).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    if (tokenInput) {
      tokenInput.value = "";
      tokenInput.setAttribute("value", "");
    }

    let notCancelled = false;

    await act(async () => {
      ({ notCancelled } = dispatchKeyDown(tokenInput, { key: "Backspace" }));
    });

    const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
    expect(notCancelled).toBe(false);
    expect(persistedValue).toBe("");
    expect(container.querySelector('input[data-editor-token-input="true"]')).toBeNull();
    expect(editor?.innerHTML).toBe("");
    expect(selectionIsAtStartOfElement(editor)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test("removes an empty first-line code block on Backspace", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue,
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    const codeElement = container.querySelector(
      `${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"] code`
    ) as HTMLElement | null;

    expect(editor).not.toBeNull();
    expect(codeElement).not.toBeNull();

    if (codeElement) {
      codeElement.textContent = "";
      selectNodeStart(codeElement);
    }

    let notCancelled = false;

    await act(async () => {
      ({ notCancelled } = dispatchKeyDown(editor, { key: "Backspace" }));
    });

    const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;
    expect(notCancelled).toBe(false);
    expect(persistedValue).toBe("");
    expect(container.querySelector(`${EDITOR_RICH_SHELL_SELECTOR} pre[data-rich-block="code"]`)).toBeNull();
    expect(editor?.innerHTML).toBe("");
    expect(selectionIsAtStartOfElement(editor)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
