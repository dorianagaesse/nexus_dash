"use client";

import { useEffect, useRef } from "react";
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

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function insertHtmlAtCursor(editor: HTMLDivElement | null, html: string) {
  if (!editor) {
    return;
  }

  editor.focus();
  exec("insertHTML", html);
}

function getSelectionText() {
  return window.getSelection()?.toString().replace(/\u00a0/g, " ").trim() ?? "";
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

  const handleInsertCodeBlock = () => {
    const selectedText = getSelectionText();
    const codeValue =
      selectedText ||
      window.prompt("Code or command", "")?.replace(/\r\n/g, "\n").trim() ||
      "";

    const codeBlock = createRichTextCodeBlock(codeValue);
    if (!codeBlock) {
      return;
    }

    insertHtmlAtCursor(editorRef.current, codeBlock);
    emitCurrentValue();
  };

  const handleInsertTokenBlock = () => {
    const label = window.prompt("Token label", "Token")?.trim() ?? "";
    if (!label) {
      return;
    }

    const selectedText = getSelectionText();
    const tokenValue =
      selectedText ||
      window.prompt("Token value", "")?.replace(/\r\n/g, "\n").trim() ||
      "";

    const tokenBlock = createRichTextTokenBlock(label, tokenValue);
    if (!tokenBlock) {
      return;
    }

    insertHtmlAtCursor(editorRef.current, tokenBlock);
    emitCurrentValue();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
          Bold
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exec("formatBlock", "h1")}
        >
          Title 1
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exec("formatBlock", "h2")}
        >
          Title 2
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
          Italic
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exec("underline")}>
          <Underline className="h-4 w-4" />
          Underline
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exec("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
          Bullet list
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exec("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" />
          Numbered list
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleInsertCodeBlock}>
          <SquareCode className="h-4 w-4" />
          Code block
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleInsertTokenBlock}>
          <KeyRound className="h-4 w-4" />
          Token block
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
            "[overflow-wrap:anywhere] [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3 [&_div[data-rich-block='token']]:my-2 [&_div[data-rich-block='token']]:rounded-xl [&_div[data-rich-block='token']]:border [&_div[data-rich-block='token']]:border-border/70 [&_div[data-rich-block='token']]:bg-muted/40 [&_div[data-rich-block='token']]:p-3 [&_div[data-rich-block='token']>p]:mb-2 [&_div[data-rich-block='token']>p]:text-[10px] [&_div[data-rich-block='token']>p]:font-semibold [&_div[data-rich-block='token']>p]:uppercase [&_div[data-rich-block='token']>p]:tracking-[0.22em] [&_div[data-rich-block='token']>p]:text-muted-foreground [&_div[data-rich-block='token']_code]:block [&_div[data-rich-block='token']_code]:overflow-x-auto [&_div[data-rich-block='token']_code]:rounded-lg [&_div[data-rich-block='token']_code]:bg-slate-950 [&_div[data-rich-block='token']_code]:px-3 [&_div[data-rich-block='token']_code]:py-2 [&_div[data-rich-block='token']_code]:font-mono [&_div[data-rich-block='token']_code]:text-[12px] [&_div[data-rich-block='token']_code]:text-slate-50 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-5 [&_pre]:text-slate-50 [&_ul]:list-disc [&_ul]:pl-5"
          )}
          onInput={(event) => {
            onChange((event.currentTarget as HTMLDivElement).innerHTML);
          }}
        />
      </EmojiFieldShell>
    </div>
  );
}
