"use client";

import * as React from "react";

import { coerceRichTextHtml, formatCompactRichTextTokenValue } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const RICH_TEXT_SHELL_CLASS =
  "my-2 rounded-xl border border-border/70 bg-background/70 p-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.9)]";
const RICH_TEXT_SHELL_HEADER_CLASS =
  "mb-2 flex items-center justify-between gap-3";
const RICH_TEXT_SHELL_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground";
const RICH_TEXT_SHELL_COPY_BUTTON_CLASS =
  "rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";
const RICH_TEXT_CODE_BLOCK_CLASS =
  "overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] leading-5 text-slate-50";
const RICH_TEXT_TOKEN_VALUE_CLASS =
  "block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] leading-5 text-slate-50";
const TOKEN_BLOCK_MARKERS = ['data-rich-block="token"', "data-rich-block='token'"];

function supportsClipboardApi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

function buildCopyButton(
  documentRef: Document,
  label: string,
  copyText: string,
  ariaLabel: string
) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = RICH_TEXT_SHELL_COPY_BUTTON_CLASS;
  button.textContent = label;
  button.dataset.richCopyText = copyText;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

export function buildEnhancedRichTextHtml(input: string): string {
  if (!input || typeof document === "undefined") {
    return input;
  }

  const hasCodeBlocks = input.includes("<pre");
  const hasTokenBlocks = TOKEN_BLOCK_MARKERS.some((marker) => input.includes(marker));

  if (!hasCodeBlocks && !hasTokenBlocks) {
    return input;
  }

  const canCopy = supportsClipboardApi();
  const template = document.createElement("template");
  template.innerHTML = input;

  template.content.querySelectorAll("pre").forEach((preElement) => {
    const codeText = preElement.textContent?.replace(/\u00a0/g, " ").trim();

    if (!codeText) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = RICH_TEXT_SHELL_CLASS;

    const header = document.createElement("div");
    header.className = RICH_TEXT_SHELL_HEADER_CLASS;

    const label = document.createElement("span");
    label.className = RICH_TEXT_SHELL_LABEL_CLASS;
    label.textContent = "Code";

    header.append(label);
    if (canCopy) {
      header.append(
        buildCopyButton(document, "Copy", codeText, "Copy code or command block")
      );
    }

    const pre = document.createElement("pre");
    pre.className = RICH_TEXT_CODE_BLOCK_CLASS;

    const code = document.createElement("code");
    code.textContent = codeText;
    pre.append(code);

    shell.append(header, pre);
    preElement.replaceWith(shell);
  });

  template.content.querySelectorAll('div[data-rich-block="token"]').forEach((tokenElement) => {
    const labelSource =
      tokenElement.querySelector("p, h1, h2, strong")?.textContent ?? "Token";
    const valueSource =
      tokenElement.querySelector("code")?.textContent ?? tokenElement.textContent ?? "";
    const normalizedLabel = labelSource.replace(/\u00a0/g, " ").trim() || "Token";
    const normalizedValue = valueSource.replace(/\u00a0/g, " ").trim();

    if (!normalizedValue) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = RICH_TEXT_SHELL_CLASS;

    const header = document.createElement("div");
    header.className = RICH_TEXT_SHELL_HEADER_CLASS;

    const label = document.createElement("span");
    label.className = RICH_TEXT_SHELL_LABEL_CLASS;
    label.textContent = normalizedLabel;

    header.append(label);
    if (canCopy) {
      header.append(
        buildCopyButton(document, "Copy", normalizedValue, `Copy ${normalizedLabel}`)
      );
    }

    const value = document.createElement("code");
    value.className = RICH_TEXT_TOKEN_VALUE_CLASS;
    value.textContent = formatCompactRichTextTokenValue(normalizedValue);
    value.title = normalizedValue;

    shell.append(header, value);
    tokenElement.replaceWith(shell);
  });

  return template.innerHTML;
}

type RichTextContentProps = React.HTMLAttributes<HTMLDivElement> & {
  html: string | null;
  emptyContentHtml?: string;
};

export function RichTextContent({
  html,
  emptyContentHtml,
  className,
  onClick,
  ...props
}: RichTextContentProps) {
  const normalizedHtml = React.useMemo(
    () => coerceRichTextHtml(html ?? "") ?? emptyContentHtml ?? "",
    [emptyContentHtml, html]
  );
  const [renderedHtml, setRenderedHtml] = React.useState(normalizedHtml);
  const resetTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setRenderedHtml(buildEnhancedRichTextHtml(normalizedHtml));
  }, [normalizedHtml]);

  React.useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    },
    []
  );

  const handleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const copyButton = target?.closest<HTMLButtonElement>("button[data-rich-copy-text]");

    if (copyButton) {
      event.preventDefault();
      event.stopPropagation();

      const copyText = copyButton.dataset.richCopyText ?? "";
      if (!copyText || !supportsClipboardApi()) {
        copyButton.textContent = "Unavailable";
        return;
      }

      if (copyText) {
        try {
          await navigator.clipboard.writeText(copyText);
          copyButton.textContent = "Copied";

          if (resetTimeoutRef.current !== null) {
            window.clearTimeout(resetTimeoutRef.current);
          }

          resetTimeoutRef.current = window.setTimeout(() => {
            copyButton.textContent = "Copy";
          }, 1600);
        } catch {
          copyButton.textContent = "Retry";
        }
      }

      return;
    }

    onClick?.(event);
  };

  return (
    <div
      {...props}
      className={cn(
        "[overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0 [&_button]:font-sans",
        className
      )}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
