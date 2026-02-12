"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function exec(command: string) {
  document.execCommand(command, false);
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  className,
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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
          Bold
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
          Italic
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exec("underline")}
        >
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
      </div>

      <div
        id={id}
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? "Write here..."}
        className={cn(
          "min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "[&:empty:before]:pointer-events-none [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        )}
        onInput={(event) => {
          onChange((event.currentTarget as HTMLDivElement).innerHTML);
        }}
      />
    </div>
  );
}
