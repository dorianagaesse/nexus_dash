"use client";

import React, { type KeyboardEvent, type MouseEvent, useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  KeyRound,
  List,
  ListOrdered,
  SquareCode,
  Underline,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmojiFieldShell } from "@/components/ui/emoji-field";
import {
  createRichTextCodeBlock,
  createRichTextTokenBlock,
  RICH_TEXT_CODE_BLOCK,
  RICH_TEXT_TOKEN_BLOCK,
} from "@/lib/rich-text";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

const MONOSPACE_FONT_FAMILY =
  "Consolas, 'Liberation Mono', Menlo, Monaco, monospace";
const STRUCTURED_BLOCK_SELECTOR = "[data-rich-block], p, div, h1, h2, blockquote, li, pre";
const BLOCK_BREAK_TAGS = new Set(["P", "DIV", "H1", "H2", "BLOCKQUOTE", "LI", "PRE"]);
const EDITOR_RICH_SHELL_TAG = "nd-rich-shell";
const EDITOR_CARET_ANCHOR = "\u200B";
const EDITOR_ACTIONS_SELECTOR = "[data-editor-actions='true']";
const EDITOR_ACTION_BUTTON_SELECTOR = "button[data-editor-action]";
const EDITOR_RICH_SHELL_SELECTOR = `${EDITOR_RICH_SHELL_TAG}[data-editor-shell]`;
const EDITOR_BLOCK_SHELL_CLASS =
  "relative my-2 block w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 bg-muted/35 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]";
const EDITOR_CODE_PRE_CLASS =
  "m-0 block w-full min-w-0 max-w-full overflow-x-hidden whitespace-pre-wrap px-3 py-3 pr-12 text-[12px] leading-6 text-foreground [overflow-wrap:anywhere]";
const EDITOR_TOKEN_SHELL_CLASS =
  "my-2 grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl border border-border/70 bg-muted/35 px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]";
const EDITOR_TOKEN_VALUE_CLASS =
  "block w-full min-w-0 max-w-full overflow-x-auto whitespace-nowrap py-1 text-[12px] leading-6 text-foreground [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
const EDITOR_ACTIONS_CLASS = "flex shrink-0 items-center gap-1.5";
const EDITOR_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";
const COPY_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6 9 17l-5-5"></path></svg>';
const EYE_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.98 7.33 7.7 4 12 4s8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7C20.02 16.67 16.3 20 12 20s-8.02-3.33-9.94-7.65Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42"></path><path d="M16.68 16.67A9.63 9.63 0 0 1 12 18c-4.3 0-8.02-3.33-9.94-7.65a1 1 0 0 1 0-.7 14.9 14.9 0 0 1 5.07-6.08"></path><path d="M14.12 5.11A9.53 9.53 0 0 1 12 5c4.3 0 8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7 14.7 14.7 0 0 1-4.03 5.08"></path><path d="M2 2l20 20"></path></svg>';

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function supportsClipboardApi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

function preventToolbarMouseDown(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeBlockText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function setMonospaceFont(element: HTMLElement) {
  element.style.fontFamily = MONOSPACE_FONT_FAMILY;
}

function setEditorCopyButtonState(
  button: HTMLButtonElement,
  state: "default" | "copied" | "retry" | "unavailable"
) {
  const icon = state === "copied" ? CHECK_ICON_SVG : COPY_ICON_SVG;
  const labelMap = {
    default: "Copy",
    copied: "Copied",
    retry: "Retry",
    unavailable: "Unavailable",
  } as const;

  button.innerHTML = icon;
  button.setAttribute("title", labelMap[state]);
}

function buildEditorIconButton(
  documentRef: Document,
  action: string,
  ariaLabel: string,
  iconSvg: string
) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = EDITOR_ICON_BUTTON_CLASS;
  button.dataset.editorAction = action;
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("title", ariaLabel);
  button.setAttribute("contenteditable", "false");
  button.innerHTML = iconSvg;
  return button;
}

function setEditorTokenVisibility(
  toggleButton: HTMLButtonElement,
  valueElement: HTMLElement,
  revealed: boolean
) {
  valueElement.dataset.editorTokenVisible = revealed ? "true" : "false";
  valueElement.setAttribute("aria-label", revealed ? "Visible token value" : "Hidden token value");
  valueElement.style.setProperty("-webkit-text-security", revealed ? "none" : "disc");

  toggleButton.setAttribute(
    "aria-label",
    revealed ? "Hide token value" : "Reveal token value"
  );
  toggleButton.setAttribute(
    "title",
    revealed ? "Hide token value" : "Reveal token value"
  );
  toggleButton.innerHTML = revealed ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
}

function extractNodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return Array.from(node.childNodes)
      .map((childNode) => extractNodeText(childNode))
      .join("");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.matches(EDITOR_ACTIONS_SELECTOR) || node.matches(EDITOR_ACTION_BUTTON_SELECTOR)) {
    return "";
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  if (node.dataset.richBlock === RICH_TEXT_TOKEN_BLOCK) {
    return node.querySelector("code")?.textContent ?? "";
  }

  if (node.dataset.richBlock === RICH_TEXT_CODE_BLOCK || node.tagName === "PRE") {
    return node.textContent ?? "";
  }

  const text = Array.from(node.childNodes)
    .map((childNode) => extractNodeText(childNode))
    .join("");

  return BLOCK_BREAK_TAGS.has(node.tagName) ? `${text}\n` : text;
}

function getSelectionRange(editor: HTMLDivElement | null): Range | null {
  if (!editor) {
    return null;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return null;
  }

  return range;
}

function getRangeText(range: Range): string {
  return normalizeBlockText(extractNodeText(range.cloneContents()));
}

function moveCaretAfter(node: Node | null) {
  if (!node) {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCaretToStart(node: Node) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCaretToEnd(node: Node) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function createEmptyParagraph(documentRef: Document): HTMLParagraphElement {
  const paragraph = documentRef.createElement("p");
  paragraph.append(documentRef.createTextNode(EDITOR_CARET_ANCHOR));
  return paragraph;
}

function createFragmentFromHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;

  return {
    fragment: template.content,
    lastNode: template.content.lastChild,
  };
}

function insertHtmlAtRange(range: Range, html: string) {
  const { fragment, lastNode } = createFragmentFromHtml(html);
  range.deleteContents();
  range.insertNode(fragment);
  moveCaretAfter(lastNode);
}

function replaceElementWithHtml(
  element: HTMLElement,
  html: string,
  caretMode: "after" | "inside-end" = "after"
) {
  const { fragment, lastNode } = createFragmentFromHtml(html);
  element.replaceWith(fragment);

  if (!lastNode) {
    return;
  }

  if (caretMode === "inside-end") {
    if (isEmptyEditorParagraph(lastNode as Element | null)) {
      moveCaretToStart(lastNode);
      return;
    }

    moveCaretToEnd(lastNode);
    return;
  }

  moveCaretAfter(lastNode);
}

function replaceElementWithFragment(element: Element, html: string) {
  const { fragment } = createFragmentFromHtml(html);
  element.replaceWith(fragment);
}

function insertTextAtRange(range: Range, text: string) {
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const nextRange = document.createRange();
  nextRange.setStart(textNode, text.length);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function createParagraphHtmlFromText(value: string): string {
  const normalizedValue = value.replace(/\r\n/g, "\n").trim();

  if (!normalizedValue) {
    return "<p><br /></p>";
  }

  return normalizedValue
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br />")}</p>`)
    .join("");
}

function resolveStructuredBlockTarget(element: HTMLElement): HTMLElement {
  return (
    (element.closest(EDITOR_RICH_SHELL_SELECTOR) as HTMLElement | null) ?? element
  );
}

function findContainingStructuredBlock(
  editor: HTMLDivElement,
  range: Range,
  blockType?: string
): HTMLElement | null {
  const resolveContainer = (node: Node) =>
    (node instanceof HTMLElement ? node : node.parentElement)?.closest(
      blockType ? `[data-rich-block="${blockType}"]` : "[data-rich-block]"
    ) as HTMLElement | null;

  const startBlock = resolveContainer(range.startContainer);
  const endBlock = resolveContainer(range.endContainer);

  if (
    startBlock &&
    endBlock &&
    startBlock === endBlock &&
    editor.contains(startBlock)
  ) {
    return startBlock;
  }

  return null;
}

function findTransformTarget(editor: HTMLDivElement, range: Range): HTMLElement {
  const baseElement =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;

  const target = baseElement?.closest(STRUCTURED_BLOCK_SELECTOR) as HTMLElement | null;
  if (target && target !== editor && editor.contains(target)) {
    return resolveStructuredBlockTarget(target);
  }

  return editor;
}

function isEmptyEditorParagraph(element: Element | null): element is HTMLParagraphElement {
  return (
    element instanceof HTMLParagraphElement &&
    normalizeBlockText(extractNodeText(element)) === ""
  );
}

function ensureParagraphAfter(target: HTMLElement) {
  const nextElement = target.nextElementSibling;
  if (isEmptyEditorParagraph(nextElement)) {
    return nextElement;
  }

  const paragraph = createEmptyParagraph(target.ownerDocument);
  target.after(paragraph);
  return paragraph;
}

function moveCaretBelowBlock(target: HTMLElement) {
  const paragraph = ensureParagraphAfter(target);
  moveCaretToStart(paragraph);
}

function findCurrentParagraph(editor: HTMLDivElement, range: Range): HTMLParagraphElement | null {
  const baseElement =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;

  const paragraph = baseElement?.closest("p") as HTMLParagraphElement | null;
  if (!paragraph || !editor.contains(paragraph)) {
    return null;
  }

  return paragraph;
}

function insertParagraphAfterParagraph(paragraph: HTMLParagraphElement) {
  const nextParagraph = createEmptyParagraph(paragraph.ownerDocument);
  paragraph.after(nextParagraph);
  moveCaretToStart(nextParagraph);
}

function getElementTextContentWithBreaks(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map((childNode) => extractNodeText(childNode))
    .join("")
    .replace(/\u00a0/g, " ");
}

function getTextOffsetWithinElement(element: HTMLElement, range: Range): number {
  const measurementRange = document.createRange();
  measurementRange.selectNodeContents(element);
  measurementRange.setEnd(range.startContainer, range.startOffset);

  return extractNodeText(measurementRange.cloneContents()).replace(/\u00a0/g, " ").length;
}

function splitTextAroundCurrentLine(text: string, offset: number) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  let consumed = 0;
  let lineIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const lineLength = lines[index]?.length ?? 0;
    if (offset <= consumed + lineLength) {
      lineIndex = index;
      break;
    }

    consumed += lineLength + 1;
    lineIndex = index;
  }

  return {
    before: lines.slice(0, lineIndex).join("\n"),
    current: lines[lineIndex] ?? "",
    after: lines.slice(lineIndex + 1).join("\n"),
  };
}

function trimTrailingEmptyParagraphHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  if (isEmptyEditorParagraph(template.content.lastElementChild)) {
    template.content.lastElementChild?.remove();
  }

  return template.innerHTML;
}

export function buildEditorRichTextHtml(input: string): string {
  if (!input || typeof document === "undefined") {
    return input;
  }

  if (input.includes(`<${EDITOR_RICH_SHELL_TAG}`)) {
    return input.replace(/\u200b/g, "");
  }

  const hasCodeBlocks = input.includes(`<pre data-rich-block="${RICH_TEXT_CODE_BLOCK}"`);
  const hasTokenBlocks = input.includes(`data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"`);

  if (!hasCodeBlocks && !hasTokenBlocks) {
    return input;
  }

  const template = document.createElement("template");
  template.innerHTML = input;

  template.content
    .querySelectorAll<HTMLElement>(`pre[data-rich-block="${RICH_TEXT_CODE_BLOCK}"]`)
    .forEach((preElement) => {
      const shell = document.createElement(EDITOR_RICH_SHELL_TAG);
      shell.dataset.editorShell = RICH_TEXT_CODE_BLOCK;
      shell.className = EDITOR_BLOCK_SHELL_CLASS;

      const actions = document.createElement("div");
      actions.className = `absolute right-2 top-2 z-10 ${EDITOR_ACTIONS_CLASS}`;
      actions.dataset.editorActions = "true";
      actions.setAttribute("contenteditable", "false");

      const copyButton = buildEditorIconButton(
        document,
        "copy-code",
        "Copy code block",
        COPY_ICON_SVG
      );
      actions.append(copyButton);

      preElement.className = EDITOR_CODE_PRE_CLASS;
      setMonospaceFont(preElement);

      const codeElement = preElement.querySelector("code");
      if (codeElement) {
        setMonospaceFont(codeElement);
      }

      preElement.replaceWith(shell);
      shell.append(actions, preElement);
    });

  template.content
    .querySelectorAll<HTMLElement>(`div[data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"]`)
    .forEach((tokenElement) => {
      tokenElement.querySelector("p, h1, h2, strong")?.remove();

      const shell = document.createElement(EDITOR_RICH_SHELL_TAG);
      shell.dataset.editorShell = RICH_TEXT_TOKEN_BLOCK;
      shell.className = EDITOR_TOKEN_SHELL_CLASS;

      tokenElement.className = "block min-w-0 max-w-full overflow-hidden";

      const valueElement = tokenElement.querySelector("code");
      if (!valueElement) {
        return;
      }

      valueElement.className = EDITOR_TOKEN_VALUE_CLASS;
      valueElement.dataset.editorTokenField = "true";
      setMonospaceFont(valueElement);

      const actions = document.createElement("div");
      actions.className = EDITOR_ACTIONS_CLASS;
      actions.dataset.editorActions = "true";
      actions.setAttribute("contenteditable", "false");

      const toggleButton = buildEditorIconButton(
        document,
        "toggle-token-visibility",
        "Reveal token value",
        EYE_ICON_SVG
      );
      setEditorTokenVisibility(toggleButton, valueElement, false);

      const copyButton = buildEditorIconButton(
        document,
        "copy-token",
        "Copy token value",
        COPY_ICON_SVG
      );

      actions.append(toggleButton, copyButton);
      tokenElement.replaceWith(shell);
      shell.append(tokenElement, actions);
    });

  const trailingElement = template.content.lastElementChild as HTMLElement | null;
  if (trailingElement?.matches(EDITOR_RICH_SHELL_SELECTOR)) {
    template.content.append(createEmptyParagraph(document));
  }

  return template.innerHTML.replace(/\u200b/g, "");
}

export function serializeEditorRichTextHtml(input: string): string {
  if (!input || typeof document === "undefined") {
    return input;
  }

  const cleanedInput = input.replace(/\u200b/g, "");
  if (!cleanedInput.includes(`<${EDITOR_RICH_SHELL_TAG}`)) {
    return cleanedInput;
  }

  const template = document.createElement("template");
  template.innerHTML = cleanedInput;

  template.content
    .querySelectorAll<HTMLElement>(EDITOR_RICH_SHELL_SELECTOR)
    .forEach((shellElement) => {
      if (shellElement.dataset.editorShell === RICH_TEXT_CODE_BLOCK) {
        const codeText =
          shellElement
            .querySelector(`pre[data-rich-block="${RICH_TEXT_CODE_BLOCK}"] code`)
            ?.textContent?.replace(/\u00a0/g, " ")
            .trim() ?? "";
        const codeHtml = createRichTextCodeBlock(codeText);

        if (!codeHtml) {
          shellElement.remove();
          return;
        }

        replaceElementWithFragment(shellElement, codeHtml);
        return;
      }

      if (shellElement.dataset.editorShell === RICH_TEXT_TOKEN_BLOCK) {
        const tokenText =
          shellElement
            .querySelector(`div[data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"] code`)
            ?.textContent?.replace(/\u00a0/g, " ")
            .trim() ?? "";
        const tokenHtml = createRichTextTokenBlock(tokenText);

        if (!tokenHtml) {
          shellElement.remove();
          return;
        }

        replaceElementWithFragment(shellElement, tokenHtml);
      }
    });

  return template.innerHTML.replace(/\u200b/g, "");
}

function applyStructuredBlock(
  editor: HTMLDivElement | null,
  blockType: string,
  createBlock: (value: string) => string | null
): boolean {
  if (!editor) {
    return false;
  }

  const range = getSelectionRange(editor);
  if (!range) {
    return false;
  }

  editor.focus();

  const containingStructuredBlock = findContainingStructuredBlock(editor, range);
  if (containingStructuredBlock) {
    const replacementTarget = resolveStructuredBlockTarget(containingStructuredBlock);
    if (containingStructuredBlock.dataset.richBlock === blockType) {
      const plainTextHtml = createParagraphHtmlFromText(extractNodeText(replacementTarget));
      replaceElementWithHtml(replacementTarget, plainTextHtml, "inside-end");
      return true;
    }

    const targetText = normalizeBlockText(extractNodeText(replacementTarget));
    if (!targetText) {
      return false;
    }

    const blockHtml = createBlock(targetText);
    if (!blockHtml) {
      return false;
    }

    replaceElementWithHtml(replacementTarget, buildEditorRichTextHtml(blockHtml));
    return true;
  }

  const selectedText = range.collapsed ? "" : getRangeText(range);
  if (selectedText) {
    const blockHtml = createBlock(selectedText);
    if (!blockHtml) {
      return false;
    }

    insertHtmlAtRange(range, buildEditorRichTextHtml(blockHtml));
    return true;
  }

  const target = findTransformTarget(editor, range);
  const targetText = normalizeBlockText(extractNodeText(target));
  if (!targetText) {
    return false;
  }

  const targetContentText = getElementTextContentWithBreaks(target);
  if (!targetContentText.trim()) {
    return false;
  }

  if (!targetContentText.includes("\n")) {
    const blockHtml = createBlock(targetText);
    if (!blockHtml) {
      return false;
    }

    const enhancedBlockHtml = buildEditorRichTextHtml(blockHtml);

    if (target === editor) {
      editor.innerHTML = enhancedBlockHtml;

      if (isEmptyEditorParagraph(editor.lastElementChild)) {
        moveCaretToStart(editor.lastElementChild);
      } else if (editor.lastChild) {
        moveCaretToEnd(editor.lastChild);
      }

      return true;
    }

    replaceElementWithHtml(target, enhancedBlockHtml, "inside-end");
    return true;
  }

  const lineSplit = splitTextAroundCurrentLine(
    targetContentText,
    getTextOffsetWithinElement(target, range)
  );
  const currentLineText = lineSplit.current.trim();
  if (!currentLineText) {
    return false;
  }

  const currentLineBlockHtml = createBlock(currentLineText);
  if (!currentLineBlockHtml) {
    return false;
  }

  const beforeHtml = lineSplit.before ? createParagraphHtmlFromText(lineSplit.before) : "";
  const afterHtml = lineSplit.after ? createParagraphHtmlFromText(lineSplit.after) : "";
  const enhancedCurrentLineHtml = afterHtml
    ? trimTrailingEmptyParagraphHtml(buildEditorRichTextHtml(currentLineBlockHtml))
    : buildEditorRichTextHtml(currentLineBlockHtml);
  const nextHtml = [beforeHtml, enhancedCurrentLineHtml, afterHtml].filter(Boolean).join("");

  if (target === editor) {
    editor.innerHTML = nextHtml;

    if (isEmptyEditorParagraph(editor.lastElementChild)) {
      moveCaretToStart(editor.lastElementChild);
    } else if (editor.lastChild) {
      moveCaretToEnd(editor.lastChild);
    }

    return true;
  }

  replaceElementWithHtml(target, nextHtml, "inside-end");
  return true;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  ariaLabelledBy,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const nextHtml = buildEditorRichTextHtml(value);
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [value]);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    },
    []
  );

  const emitCurrentValue = () => {
    if (!editorRef.current) {
      return;
    }

    onChange(serializeEditorRichTextHtml(editorRef.current.innerHTML));
  };

  const runFormattingCommand = (command: string, commandValue?: string) => {
    exec(command, commandValue);
    emitCurrentValue();
  };

  const handleInsertCodeBlock = () => {
    if (applyStructuredBlock(editorRef.current, RICH_TEXT_CODE_BLOCK, createRichTextCodeBlock)) {
      emitCurrentValue();
    }
  };

  const handleInsertTokenBlock = () => {
    if (
      applyStructuredBlock(editorRef.current, RICH_TEXT_TOKEN_BLOCK, createRichTextTokenBlock)
    ) {
      emitCurrentValue();
    }
  };

  const handleEditorMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest(EDITOR_ACTION_BUTTON_SELECTOR)) {
      event.preventDefault();
    }
  };

  const handleEditorClick = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const actionButton = target?.closest(EDITOR_ACTION_BUTTON_SELECTOR) as HTMLButtonElement | null;

    if (!actionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const editorShell = actionButton.closest(EDITOR_RICH_SHELL_SELECTOR) as HTMLElement | null;
    if (!editorShell) {
      return;
    }

    if (actionButton.dataset.editorAction === "toggle-token-visibility") {
      const valueElement = editorShell.querySelector(
        "code[data-editor-token-field='true']"
      ) as HTMLElement | null;

      if (!valueElement) {
        return;
      }

      const revealed = valueElement.dataset.editorTokenVisible === "true";
      setEditorTokenVisibility(actionButton, valueElement, !revealed);
      return;
    }

    const copyTarget =
      actionButton.dataset.editorAction === "copy-code"
        ? (editorShell.querySelector(
            `pre[data-rich-block="${RICH_TEXT_CODE_BLOCK}"] code`
          ) as HTMLElement | null)
        : (editorShell.querySelector(
            `div[data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"] code`
          ) as HTMLElement | null);

    const copyText = copyTarget?.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
    if (!copyText || !supportsClipboardApi()) {
      setEditorCopyButtonState(actionButton, "unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
      setEditorCopyButtonState(actionButton, "copied");

      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }

      resetTimeoutRef.current = window.setTimeout(() => {
        setEditorCopyButtonState(actionButton, "default");
      }, 1600);
    } catch {
      setEditorCopyButtonState(actionButton, "retry");
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    const range = getSelectionRange(editor);

    if (!editor || !range || event.key !== "Enter") {
      return;
    }

    const currentParagraph = findCurrentParagraph(editor, range);
    if (
      currentParagraph &&
      isEmptyEditorParagraph(currentParagraph) &&
      currentParagraph.previousElementSibling?.matches(EDITOR_RICH_SHELL_SELECTOR)
    ) {
      event.preventDefault();
      insertParagraphAfterParagraph(currentParagraph);
      return;
    }

    const codeBlock = findContainingStructuredBlock(editor, range, RICH_TEXT_CODE_BLOCK);
    if (codeBlock) {
      event.preventDefault();

      if (event.shiftKey) {
        insertTextAtRange(range, "\n");
        emitCurrentValue();
      } else {
        moveCaretBelowBlock(resolveStructuredBlockTarget(codeBlock));
      }
      return;
    }

    const tokenBlock = findContainingStructuredBlock(editor, range, RICH_TEXT_TOKEN_BLOCK);
    if (tokenBlock) {
      event.preventDefault();
      moveCaretBelowBlock(resolveStructuredBlockTarget(tokenBlock));
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("bold")}
        >
          <Bold className="h-4 w-4" />
          Bold
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("formatBlock", "h1")}
        >
          Title 1
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("formatBlock", "h2")}
        >
          Title 2
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("italic")}
        >
          <Italic className="h-4 w-4" />
          Italic
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("underline")}
        >
          <Underline className="h-4 w-4" />
          Underline
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
          Bullet list
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runFormattingCommand("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" />
          Numbered list
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={handleInsertCodeBlock}
        >
          <SquareCode className="h-4 w-4" />
          Code
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onMouseDown={preventToolbarMouseDown}
          onClick={handleInsertTokenBlock}
        >
          <KeyRound className="h-4 w-4" />
          Token
        </Button>
      </div>

      <EmojiFieldShell targetRef={editorRef} buttonPlacement="top">
        <div
          id={id}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          data-placeholder={placeholder ?? "Write here..."}
          className={cn(
            "min-h-[140px] w-full max-w-full overflow-x-hidden rounded-md border border-input bg-background px-3 py-2 pr-14 text-sm text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "[&:empty:before]:pointer-events-none [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]",
            "[overflow-wrap:anywhere] [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3",
            "[&_nd-rich-shell]:w-full [&_nd-rich-shell]:max-w-full [&_nd-rich-shell]:min-w-0",
            "[&_pre[data-rich-block='code']]:my-0 [&_pre[data-rich-block='code']_code]:block [&_pre[data-rich-block='code']_code]:whitespace-pre-wrap [&_pre[data-rich-block='code']_code]:[overflow-wrap:anywhere]",
            "[&_pre[data-rich-block='code']_code]:[font-family:Consolas,Monaco,'Liberation_Mono',Menlo,monospace]",
            "[&_div[data-rich-block='token']]:w-full [&_div[data-rich-block='token']]:min-w-0 [&_div[data-rich-block='token']]:max-w-full [&_div[data-rich-block='token']_code]:w-full [&_div[data-rich-block='token']_code]:max-w-full [&_div[data-rich-block='token']_code]:[font-family:Consolas,Monaco,'Liberation_Mono',Menlo,monospace]",
            "[&_div[data-rich-block='token']_code]:selection:bg-foreground/20 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold",
            "[&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          )}
          onMouseDown={handleEditorMouseDown}
          onClick={handleEditorClick}
          onKeyDown={handleEditorKeyDown}
          onInput={(event) => {
            onChange(
              serializeEditorRichTextHtml((event.currentTarget as HTMLDivElement).innerHTML)
            );
          }}
        />
      </EmojiFieldShell>
    </div>
  );
}
