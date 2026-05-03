"use client";

import * as React from "react";

import {
  MentionTooltipPortal,
  resolveMentionDisplayUser,
  type MentionDisplayUser,
} from "@/components/ui/mention-hover-card";
import { parseMentions, type ParsedMention } from "@/lib/mention";
import { coerceRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const MONOSPACE_FONT_FAMILY =
  "Consolas, 'Liberation Mono', Menlo, Monaco, monospace";
const RICH_TEXT_SHELL_CLASS =
  "relative my-2 block w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 bg-muted/35 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]";
const RICH_TEXT_SHELL_ACTIONS_CLASS =
  "absolute right-2 top-2 z-10 flex items-center gap-1.5";
const RICH_TEXT_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:border-foreground/20 hover:text-foreground";
const RICH_TEXT_CODE_BLOCK_CLASS =
  "m-0 block w-full min-w-0 max-w-full overflow-x-hidden whitespace-pre-wrap px-3 py-3 pr-12 text-[12px] leading-6 text-foreground [overflow-wrap:anywhere]";
const RICH_TEXT_TOKEN_SHELL_CLASS =
  "my-2 grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl border border-border/70 bg-muted/35 px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]";
const RICH_TEXT_TOKEN_VALUE_CLASS =
  "block w-full min-w-0 max-w-full overflow-x-auto whitespace-nowrap py-1 text-[12px] leading-6 text-foreground [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
const RICH_TEXT_TOKEN_ACTIONS_CLASS = "flex shrink-0 items-center gap-1.5";
const TOKEN_BLOCK_MARKERS = [
  'data-rich-block="token"',
  "data-rich-block='token'",
];
const HIDDEN_TOKEN_VALUE_MASK = "********";
const RICH_TEXT_MENTION_CLASS =
  "inline-block rounded-md bg-primary/15 px-1 py-0.5 align-baseline font-medium text-primary not-italic";
const RICH_TEXT_MENTION_SELECTOR = "[data-rich-mention='true']";
const COPY_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6 9 17l-5-5"></path></svg>';
const EYE_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.98 7.33 7.7 4 12 4s8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7C20.02 16.67 16.3 20 12 20s-8.02-3.33-9.94-7.65Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_ICON_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42"></path><path d="M16.68 16.67A9.63 9.63 0 0 1 12 18c-4.3 0-8.02-3.33-9.94-7.65a1 1 0 0 1 0-.7 14.9 14.9 0 0 1 5.07-6.08"></path><path d="M14.12 5.11A9.53 9.53 0 0 1 12 5c4.3 0 8.02 3.33 9.94 7.65a1 1 0 0 1 0 .7 14.7 14.7 0 0 1-4.03 5.08"></path><path d="M2 2l20 20"></path></svg>';

function supportsClipboardApi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  );
}

function setMonospaceFont(element: HTMLElement) {
  element.style.fontFamily = MONOSPACE_FONT_FAMILY;
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

function buildCopyButton(
  documentRef: Document,
  copyText: string,
  ariaLabel: string
) {
  const button = buildIconButton(documentRef, "copy", ariaLabel, COPY_ICON_SVG);
  button.dataset.richCopyText = copyText;
  return button;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function isPointInsideElementClientRects(
  element: HTMLElement,
  point: { clientX: number; clientY: number }
): boolean {
  const rects = Array.from(element.getClientRects());
  const targetRects =
    rects.length > 0 ? rects : [element.getBoundingClientRect()];

  return targetRects.some(
    (rect) =>
      point.clientX >= rect.left &&
      point.clientX <= rect.right &&
      point.clientY >= rect.top &&
      point.clientY <= rect.bottom
  );
}

function isPointerOverMentionElement(
  element: HTMLElement,
  point: { clientX: number; clientY: number }
): boolean {
  if (!isPointInsideElementClientRects(element, point)) {
    return false;
  }

  const pointedElement = element.ownerDocument.elementFromPoint(
    point.clientX,
    point.clientY
  );
  return pointedElement === element || element.contains(pointedElement);
}

function setCopyButtonState(
  button: HTMLButtonElement,
  state: "default" | "copied" | "retry" | "unavailable"
) {
  const icon = state === "copied" ? CHECK_ICON_SVG : COPY_ICON_SVG;
  const titleMap = {
    default: "Copy",
    copied: "Copied",
    retry: "Retry",
    unavailable: "Unavailable",
  } as const;

  button.innerHTML = icon;
  button.setAttribute("title", titleMap[state]);
}

function setTokenVisibility(
  toggleButton: HTMLButtonElement,
  valueElement: HTMLElement,
  revealed: boolean
) {
  const rawValue = valueElement.dataset.richTokenValue ?? "";
  valueElement.dataset.richTokenRevealed = revealed ? "true" : "false";
  valueElement.textContent = revealed ? rawValue : HIDDEN_TOKEN_VALUE_MASK;
  valueElement.setAttribute(
    "aria-label",
    revealed ? "Visible token value" : "Hidden token value"
  );
  setMonospaceFont(valueElement);

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

export function buildEnhancedRichTextHtml(
  input: string,
  mentionUsers?: MentionDisplayUser[]
): string {
  if (!input || typeof document === "undefined") {
    return input;
  }

  const hasCodeBlocks = input.includes("<pre");
  const hasTokenBlocks = TOKEN_BLOCK_MARKERS.some((marker) =>
    input.includes(marker)
  );
  const hasMentions = input.includes("@");

  if (!hasCodeBlocks && !hasTokenBlocks && !hasMentions) {
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

    const actions = document.createElement("div");
    actions.className = RICH_TEXT_SHELL_ACTIONS_CLASS;

    if (canCopy) {
      actions.append(buildCopyButton(document, codeText, "Copy code block"));
    }

    const pre = document.createElement("pre");
    pre.className = RICH_TEXT_CODE_BLOCK_CLASS;
    setMonospaceFont(pre);

    const code = document.createElement("code");
    code.textContent = codeText;
    setMonospaceFont(code);
    pre.append(code);

    if (actions.childNodes.length > 0) {
      shell.append(actions);
    }
    shell.append(pre);
    preElement.replaceWith(shell);
  });

  template.content
    .querySelectorAll('div[data-rich-block="token"]')
    .forEach((tokenElement) => {
      const normalizedValue =
        tokenElement
          .querySelector("code")
          ?.textContent?.replace(/\u00a0/g, " ")
          .trim() ?? "";

      if (!normalizedValue) {
        return;
      }

      const shell = document.createElement("div");
      shell.className = RICH_TEXT_TOKEN_SHELL_CLASS;
      shell.dataset.richTokenShell = "true";

      const value = document.createElement("code");
      value.className = RICH_TEXT_TOKEN_VALUE_CLASS;
      value.dataset.richTokenValue = normalizedValue;
      setMonospaceFont(value);

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
        actions.append(
          buildCopyButton(document, normalizedValue, "Copy token value")
        );
      }

      shell.append(value, actions);
      tokenElement.replaceWith(shell);
    });

  if (hasMentions) {
    highlightMentionTextNodes(template.content, mentionUsers);
  }

  return template.innerHTML;
}

function highlightMentionTextNodes(
  root: DocumentFragment,
  mentionUsers?: MentionDisplayUser[]
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Array<{ textNode: Text; mentions: ParsedMention[] }> = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const parentElement = textNode.parentElement;
    if (
      !parentElement ||
      parentElement.closest(
        "pre, code, button, input, textarea, [data-rich-token-shell]"
      )
    ) {
      continue;
    }

    const { mentions }: { mentions: ParsedMention[] } = parseMentions(
      textNode.data
    );
    if (mentions.length > 0) {
      textNodes.push({ textNode, mentions });
    }
  }

  for (const { textNode, mentions } of textNodes) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const mention of mentions) {
      if (mention.startIndex > lastIndex) {
        fragment.append(
          document.createTextNode(
            textNode.data.slice(lastIndex, mention.startIndex)
          )
        );
      }

      const mentionElement = document.createElement("span");
      mentionElement.className = RICH_TEXT_MENTION_CLASS;
      mentionElement.dataset.richMention = "true";
      mentionElement.dataset.mentionUsername = mention.username;
      if (mention.discriminator) {
        mentionElement.dataset.mentionDiscriminator = mention.discriminator;
      }

      mentionElement.textContent = `@${mention.username}`;
      fragment.append(mentionElement);
      lastIndex = mention.endIndex;
    }

    if (lastIndex < textNode.data.length) {
      fragment.append(document.createTextNode(textNode.data.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  }
}

type RichTextContentProps = React.HTMLAttributes<HTMLDivElement> & {
  html: string | null;
  emptyContentHtml?: string;
  mentionUsers?: MentionDisplayUser[];
};

export function RichTextContent({
  html,
  emptyContentHtml,
  mentionUsers,
  className,
  onClick,
  onMouseLeave,
  onBlur,
  ...props
}: RichTextContentProps) {
  const normalizedHtml = React.useMemo(
    () => coerceRichTextHtml(html ?? "") ?? emptyContentHtml ?? "",
    [emptyContentHtml, html]
  );
  const [isMounted, setIsMounted] = React.useState(false);
  const [mentionTooltip, setMentionTooltip] = React.useState<{
    user: MentionDisplayUser;
    anchorRect: DOMRect;
  } | null>(null);
  const activeMentionElementRef = React.useRef<HTMLElement | null>(null);
  const resetTimeoutRef = React.useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  const renderedHtml = React.useMemo(() => {
    if (!isMounted) {
      return normalizedHtml;
    }

    return buildEnhancedRichTextHtml(normalizedHtml, mentionUsers);
  }, [isMounted, mentionUsers, normalizedHtml]);

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
    const actionButton = target?.closest(
      "button[data-rich-action]"
    ) as HTMLButtonElement | null;
    const copyButton = target?.closest(
      "button[data-rich-copy-text]"
    ) as HTMLButtonElement | null;

    if (actionButton?.dataset.richAction === "toggle-token") {
      event.preventDefault();
      event.stopPropagation();

      const shell = actionButton.closest(
        "[data-rich-token-shell]"
      ) as HTMLElement | null;
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

  const handleMentionHover = (
    target: EventTarget | null,
    currentTarget: HTMLDivElement,
    pointer?: { clientX: number; clientY: number }
  ) => {
    if (
      !mentionUsers ||
      mentionUsers.length === 0 ||
      !(target instanceof HTMLElement)
    ) {
      activeMentionElementRef.current = null;
      setMentionTooltip(null);
      return;
    }

    const mentionElement = target.closest(
      RICH_TEXT_MENTION_SELECTOR
    ) as HTMLElement | null;
    if (!mentionElement || !currentTarget.contains(mentionElement)) {
      activeMentionElementRef.current = null;
      setMentionTooltip(null);
      return;
    }

    if (pointer) {
      const isInsideMention =
        isPointInsideElementClientRects(mentionElement, pointer);
      if (!isInsideMention) {
        activeMentionElementRef.current = null;
        setMentionTooltip(null);
        return;
      }
    }

    const username = mentionElement.dataset.mentionUsername;
    if (!username) {
      return;
    }

    const user = resolveMentionDisplayUser(
      {
        username,
        discriminator: mentionElement.dataset.mentionDiscriminator ?? null,
      },
      mentionUsers
    );
    if (!user) {
      activeMentionElementRef.current = null;
      setMentionTooltip(null);
      return;
    }

    activeMentionElementRef.current = mentionElement;
    setMentionTooltip({
      user,
      anchorRect: mentionElement.getBoundingClientRect(),
    });
  };

  const handleMentionMouseOut = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const mentionElement = target?.closest(
      RICH_TEXT_MENTION_SELECTOR
    ) as HTMLElement | null;
    if (!mentionElement) {
      return;
    }

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && mentionElement.contains(relatedTarget)) {
      return;
    }

    activeMentionElementRef.current = null;
    setMentionTooltip(null);
  };

  React.useEffect(() => {
    if (!mentionTooltip) {
      return;
    }

    const handleDocumentPointerMove = (event: PointerEvent) => {
      const activeMentionElement = activeMentionElementRef.current;
      if (
        !activeMentionElement ||
        !isPointerOverMentionElement(activeMentionElement, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
      ) {
        activeMentionElementRef.current = null;
        setMentionTooltip(null);
      }
    };

    document.addEventListener("pointermove", handleDocumentPointerMove, true);
    return () => {
      document.removeEventListener(
        "pointermove",
        handleDocumentPointerMove,
        true
      );
    };
  }, [mentionTooltip]);

  return (
    <>
      <div
        {...props}
        className={cn(
          "max-w-full overflow-x-hidden [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words",
          "[&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3",
          "[&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold",
          "[&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4",
          "[&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0 [&_button]:font-sans",
          "[&_[data-rich-mention='true']]:cursor-default",
          className
        )}
        onClick={handleClick}
        onMouseOver={(event) =>
          handleMentionHover(event.target, event.currentTarget, {
            clientX: event.clientX,
            clientY: event.clientY,
          })
        }
        onMouseMove={(event) =>
          handleMentionHover(event.target, event.currentTarget, {
            clientX: event.clientX,
            clientY: event.clientY,
          })
        }
        onMouseOutCapture={handleMentionMouseOut}
        onMouseLeave={(event) => {
          activeMentionElementRef.current = null;
          setMentionTooltip(null);
          onMouseLeave?.(event);
        }}
        onFocus={(event) =>
          handleMentionHover(event.target, event.currentTarget)
        }
        onBlur={(event) => {
          activeMentionElementRef.current = null;
          setMentionTooltip(null);
          onBlur?.(event);
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      {mentionTooltip ? (
        <MentionTooltipPortal
          user={mentionTooltip.user}
          anchorRect={mentionTooltip.anchorRect}
        />
      ) : null}
    </>
  );
}
