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

async function expectEnterFromTrailingParagraphToStayBelowBlock(
  initialValue: string,
  expectedPersistentValue: string,
  expectedActionSelector?: string
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

  const paragraphs = editor?.querySelectorAll("p") ?? [];
  const selection = window.getSelection();
  const persistedValue = container.querySelector("output[data-testid='value']")?.textContent;

  expect(paragraphs).toHaveLength(2);
  expect(selection?.anchorNode && paragraphs[1]?.contains(selection.anchorNode)).toBe(true);
  expect(persistedValue).toBe(expectedPersistentValue);

  if (expectedActionSelector) {
    expect(container.querySelector(expectedActionSelector)).not.toBeNull();
  }

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

  test("keeps the caret in the paragraph below a token block when Enter is pressed", async () => {
    const initialValue = createRichTextTokenBlock("secret-token") ?? "";

    await expectEnterFromTrailingParagraphToStayBelowBlock(
      initialValue,
      initialValue,
      'button[aria-label="Reveal token value"]'
    );
  });

  test("keeps the caret in the paragraph below a code block when Enter is pressed", async () => {
    const initialValue = createRichTextCodeBlock("npm run lint") ?? "";

    await expectEnterFromTrailingParagraphToStayBelowBlock(
      initialValue,
      initialValue,
      'button[aria-label="Copy code block"]'
    );
  });

  test("uses native undo shortcuts inside the editor", async () => {
    const execCommandSpy = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommandSpy,
    });
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(EditorHarness, {
        initialValue: "<p>hello</p>",
      })
    );

    const editor = container.querySelector<HTMLDivElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();

    await act(async () => {
      editor?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "z",
          ctrlKey: true,
        })
      );
    });

    expect(execCommandSpy).toHaveBeenCalledWith("undo", false, undefined);

    await act(async () => {
      editor?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "z",
          ctrlKey: true,
          shiftKey: true,
        })
      );
    });

    expect(execCommandSpy).toHaveBeenCalledWith("redo", false, undefined);

    await act(async () => {
      root.unmount();
    });
  });
});
