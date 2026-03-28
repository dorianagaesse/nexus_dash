"use client";

import * as React from "react";

import {
  coerceRichTextHtml,
  DEFAULT_RICH_TEXT_TOKEN_LABEL,
} from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const MONOSPACE_FONT_FAMILY =
  "Consolas, 'Liberation Mono', Menlo, Monaco, monospace";
const RICH_TEXT_SHELL_CLASS =
  "my-2 rounded-xl border border-border/70 bg-background/70 p-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.9)]";
const RICH_TEXT_SHELL_HEADER_CLASS =
  "mb-2 flex items-center justify-between gap-3";
const RICH_TEXT_SHELL_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground";
const RICH_TEXT_SHELL_COPY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";
const RICH_TEXT_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";
const RICH_TEXT_TOKEN_SHELL_CLASS =
  "my-2 flex items-center gap-3 overflow-hidden rounded-xl border border-border/70 bg-background/70 px-3 py-2 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.9)]";
const RICH_TEXT_TOKEN_CONTENT_CLASS =
  "flex min-w-0 flex-1 items-center gap-2 overflow-hidden";
const RICH_TEXT_TOKEN_VALUE_CLASS =
  "block min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-[12px] leading-5 text-slate-50";
const RICH_TEXT_TOKEN_VALUE_HIDDEN_CLASS =
  "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-[12px] leading-5 text-slate-300";
const RICH_TEXT_TOKEN_ACTIONS_CLASS = "flex shrink-0 items-center gap-2";
const RICH_TEXT_CODE_BLOCK_CLASS =
  "overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 text-[12px] leading-5 text-slate-50";
const TOKEN_BLOCK_MARKERS = ['data-rich-block="token"', "data-rich-block='token'"];
const HIDDEN_TOKEN_VALUE_LABEL = "Hidden value";
const COPY_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><path d="M20 6 9 17l-5-5"></path></svg>';
const EYE_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.98 7.33 7.7 4 12 4s8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7C20.02 16.67 16.3 20 12 20s-8.02-3.33-9.94-7.65Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42"></path><path d="M16.68 16.67A9.63 9.63 0 0 1 12 18c-4.3 0-8.02-3.33-9.94-7.65a1 1 0 0 1 0-.7 14.9 14.9 0 0 1 5.07-6.08"></path><path d="M14.12 5.11A9.53 9.53 0 0 1 12 5c4.3 0 8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7 14.7 14.7 0 0 1-4.03 5.08"></path><path d="M2 2l20 20"></path></svg>';

function supportsClipboardApi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

function setMonospaceFont(element: HTMLElement) {
  element.style.fontFamily = MONOSPACE_FONT_FAMILY;
}

function buildCopyButton(
  documentRef: Document,
  copyText: string,
  ariaLabel: string
) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = RICH_TEXT_SHELL_COPY_BUTTON_CLASS;
  button.dataset.richCopyText = copyText;
  button.dataset.richCopyDefaultLabel = "Copy";
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("title", ariaLabel);
  button.innerHTML = `${COPY_ICON_SVG}<span>Copy</span>`;
  return button;
}

function setCopyButtonState(button: HTMLButtonElement, state: "default" | "copied" | "retry" | "unavailable") {
  const labelMap = {
    default: "Copy",
    copied: "Copied",
    retry: "Retry",
    unavailable: "Unavailable",
  } as const;
  const iconMap = {
    default: COPY_ICON_SVG,
    copied: CHECK_ICON_SVG,
    retry: COPY_ICON_SVG,
    unavailable: COPY_ICON_SVG,
  } as const;

  button.innerHTML = `${iconMap[state]}<span>${labelMap[state]}</span>`;
}

function buildIconButton(
  documentRef: Document,
  action: string,
  ariaLabel: string,
  iconSvg: string
) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = RICH_TEXT_ICON_BUTTON_CLASS;
  button.dataset.richAction = action;
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("title", ariaLabel);
  button.innerHTML = iconSvg;
  return button;
}

function setTokenVisibility(
  toggleButton: HTMLButtonElement,
  valueElement: HTMLElement,
  revealed: boolean
) {
  const rawValue = valueElement.dataset.richTokenValue ?? "";
  valueElement.dataset.richTokenRevealed = revealed ? "true" : "false";
  valueElement.textContent = revealed ? rawValue : HIDDEN_TOKEN_VALUE_LABEL;
  valueElement.className = revealed
    ? RICH_TEXT_TOKEN_VALUE_CLASS
    : RICH_TEXT_TOKEN_VALUE_HIDDEN_CLASS;
  setMonospaceFont(valueElement);

  toggleButton.setAttribute("aria-label", revealed ? "Hide token value" : "Reveal token value");
  toggleButton.setAttribute("title", revealed ? "Hide token value" : "Reveal token value");
  toggleButton.innerHTML = revealed ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
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
      header.append(buildCopyButton(document, codeText, "Copy code block"));
    }

    const pre = document.createElement("pre");
    pre.className = RICH_TEXT_CODE_BLOCK_CLASS;
    setMonospaceFont(pre);

    const code = document.createElement("code");
    code.textContent = codeText;
    code.style.fontFamily = MONOSPACE_FONT_FAMILY;
    pre.append(code);

    shell.append(header, pre);
    preElement.replaceWith(shell);
  });

  template.content.querySelectorAll('div[data-rich-block="token"]').forEach((tokenElement) => {
    const labelSource =
      tokenElement.querySelector("p, h1, h2, strong")?.textContent ?? DEFAULT_RICH_TEXT_TOKEN_LABEL;
    const valueSource =
      tokenElement.querySelector("code")?.textContent ?? tokenElement.textContent ?? "";
    const normalizedLabel = labelSource.replace(/\u00a0/g, " ").trim() || DEFAULT_RICH_TEXT_TOKEN_LABEL;
    const normalizedValue = valueSource.replace(/\u00a0/g, " ").trim();

    if (!normalizedValue) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = RICH_TEXT_TOKEN_SHELL_CLASS;
    shell.dataset.richTokenShell = "true";

    const content = document.createElement("div");
    content.className = RICH_TEXT_TOKEN_CONTENT_CLASS;

    const label = document.createElement("span");
    label.className = RICH_TEXT_SHELL_LABEL_CLASS;
    label.textContent = normalizedLabel;

    const value = document.createElement("code");
    value.dataset.richTokenValue = normalizedValue;

    content.append(label, value);

    const actions = document.createElement("div");
    actions.className = RICH_TEXT_TOKEN_ACTIONS_CLASS;

    const toggleButton = buildIconButton(
      document,
      "toggle-token",
      "Reveal token value",
      EYE_ICON_SVG
    );
    setTokenVisibility(toggleButton, value, false);
    actions.append(toggleButton);

    if (canCopy) {
      actions.append(buildCopyButton(document, normalizedValue, `Copy ${normalizedLabel}`));
    }

    shell.append(content, actions);
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
    const actionButton = target?.closest("button[data-rich-action]") as HTMLButtonElement | null;
    const copyButton = target?.closest(
      "button[data-rich-copy-text]"
    ) as HTMLButtonElement | null;

    if (actionButton?.dataset.richAction === "toggle-token") {
      event.preventDefault();
      event.stopPropagation();

      const shell = actionButton.closest("[data-rich-token-shell]") as HTMLElement | null;
      const valueElement = shell?.querySelector(
        "code[data-rich-token-value]"
      ) as HTMLElement | null;
      if (!valueElement) {
        return;
      }

      const revealed = valueElement.dataset.richTokenRevealed === "true";
      setTokenVisibility(actionButton, valueElement, !revealed);
      return;
    }

    if (copyButton) {
      event.preventDefault();
      event.stopPropagation();

      const copyText = copyButton.dataset.richCopyText ?? "";
      if (!copyText || !supportsClipboardApi()) {
        setCopyButtonState(copyButton, "unavailable");
        return;
      }

      try {
        await navigator.clipboard.writeText(copyText);
        setCopyButtonState(copyButton, "copied");

        if (resetTimeoutRef.current !== null) {
          window.clearTimeout(resetTimeoutRef.current);
        }

        resetTimeoutRef.current = window.setTimeout(() => {
          setCopyButtonState(copyButton, "default");
        }, 1600);
      } catch {
        setCopyButtonState(copyButton, "retry");
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
