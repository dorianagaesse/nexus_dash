"use client";

import { type MouseEvent, useEffect, useRef } from "react";
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

const STRUCTURED_BLOCK_SELECTOR =
  "[data-rich-block], p, div, h1, h2, blockquote, li, pre";
const BLOCK_BREAK_TAGS = new Set(["P", "DIV", "H1", "H2", "BLOCKQUOTE", "LI", "PRE"]);

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function preventToolbarMouseDown(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function normalizeBlockText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
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

  if (node.tagName === "BR") {
    return "\n";
  }

  if (node.dataset.richBlock === "token") {
    return node.querySelector("code")?.textContent ?? "";
  }

  if (node.tagName === "PRE") {
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

function findTransformTarget(editor: HTMLDivElement, range: Range): HTMLElement {
  const baseElement =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;

  const target = baseElement?.closest(STRUCTURED_BLOCK_SELECTOR) as HTMLElement | null;
  if (target && target !== editor && editor.contains(target)) {
    return target;
  }

  return editor;
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

function replaceElementWithHtml(element: HTMLElement, html: string) {
  const { fragment, lastNode } = createFragmentFromHtml(html);
  element.replaceWith(fragment);
  moveCaretAfter(lastNode);
}

function applyStructuredBlock(
  editor: HTMLDivElement | null,
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

  const selectedText = range.collapsed ? "" : getRangeText(range);
  if (selectedText) {
    const blockHtml = createBlock(selectedText);
    if (!blockHtml) {
      return false;
    }

    insertHtmlAtRange(range, blockHtml);
    return true;
  }

  const target = findTransformTarget(editor, range);
  const targetText = normalizeBlockText(extractNodeText(target));
  if (!targetText) {
    return false;
  }

  const blockHtml = createBlock(targetText);
  if (!blockHtml) {
    return false;
  }

  if (target === editor) {
    editor.innerHTML = blockHtml;
    moveCaretAfter(editor.lastChild);
    return true;
  }

  replaceElementWithHtml(target, blockHtml);
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

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const emitCurrentValue = () => {
    if (!editorRef.current) {
      return;
    }

    onChange(editorRef.current.innerHTML);
  };

  const runFormattingCommand = (command: string, commandValue?: string) => {
    exec(command, commandValue);
    emitCurrentValue();
  };

  const handleInsertCodeBlock = () => {
    if (applyStructuredBlock(editorRef.current, createRichTextCodeBlock)) {
      emitCurrentValue();
    }
  };

  const handleInsertTokenBlock = () => {
    if (applyStructuredBlock(editorRef.current, createRichTextTokenBlock)) {
      emitCurrentValue();
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
            "min-h-[140px] rounded-md border border-input bg-background px-3 py-2 pr-14 text-sm text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "[&:empty:before]:pointer-events-none [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]",
            "[overflow-wrap:anywhere] [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3",
            "[&_div[data-rich-block='token']]:my-2 [&_div[data-rich-block='token']]:flex [&_div[data-rich-block='token']]:items-center [&_div[data-rich-block='token']]:gap-2 [&_div[data-rich-block='token']]:rounded-xl [&_div[data-rich-block='token']]:border [&_div[data-rich-block='token']]:border-border/70 [&_div[data-rich-block='token']]:bg-muted/40 [&_div[data-rich-block='token']]:px-3 [&_div[data-rich-block='token']]:py-2",
            "[&_div[data-rich-block='token']>p]:m-0 [&_div[data-rich-block='token']>p]:shrink-0 [&_div[data-rich-block='token']>p]:text-[10px] [&_div[data-rich-block='token']>p]:font-semibold [&_div[data-rich-block='token']>p]:uppercase [&_div[data-rich-block='token']>p]:tracking-[0.22em] [&_div[data-rich-block='token']>p]:text-muted-foreground",
            "[&_div[data-rich-block='token']_code]:block [&_div[data-rich-block='token']_code]:min-w-0 [&_div[data-rich-block='token']_code]:flex-1 [&_div[data-rich-block='token']_code]:overflow-x-auto [&_div[data-rich-block='token']_code]:whitespace-nowrap [&_div[data-rich-block='token']_code]:rounded-md [&_div[data-rich-block='token']_code]:bg-slate-950 [&_div[data-rich-block='token']_code]:px-2.5 [&_div[data-rich-block='token']_code]:py-1.5 [&_div[data-rich-block='token']_code]:text-[12px] [&_div[data-rich-block='token']_code]:text-slate-50",
            "[&_div[data-rich-block='token']_code]:[font-family:Consolas,Monaco,'Liberation_Mono',Menlo,monospace]",
            "[&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-[12px] [&_pre]:leading-5 [&_pre]:text-slate-50",
            "[&_pre]:[font-family:Consolas,Monaco,'Liberation_Mono',Menlo,monospace] [&_ul]:list-disc [&_ul]:pl-5"
          )}
          onInput={(event) => {
            onChange((event.currentTarget as HTMLDivElement).innerHTML);
          }}
        />
      </EmojiFieldShell>
    </div>
  );
}
