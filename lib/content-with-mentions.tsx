"use client";

import React from "react";

import {
  MentionText,
  type MentionDisplayUser,
} from "@/components/ui/mention-hover-card";
import { parseAgentMentions, parseMentions } from "@/lib/mention";

/**
 * Canonical highlight class for @username mentions.
 * Used consistently across task descriptions, kanban cards, and comments.
 */
export const MENTION_HIGHLIGHT_CLASS =
  "inline-block rounded-md bg-primary/15 px-1 py-0.5 align-baseline font-medium text-primary not-italic";

/**
 * Mention highlight class for transparent textarea mirrors.
 *
 * The browser caret belongs to the invisible textarea, so the visible mirror
 * must keep the same inline metrics as plain textarea text. Avoid padding,
 * inline-block, and font-weight changes here.
 */
export const MENTION_TEXTAREA_MIRROR_HIGHLIGHT_CLASS =
  "rounded-sm bg-primary/15 px-0 py-0 font-normal text-primary not-italic";

/**
 * Renders content with @username mentions highlighted.
 * Splits content into segments and wraps mention patterns in styled spans.
 */
export function renderContentWithMentions(
  content: string,
  options?: {
    mentionHighlightClassName?: string;
    mentionUsers?: MentionDisplayUser[];
    hideMentionDiscriminator?: boolean;
    preserveMentionText?: boolean;
    resolveDisplayUsers?: boolean;
    renderAgentMentions?: boolean;
  }
): React.ReactNode {
  const { mentions } = parseMentions(content);
  // `@{Label}` tokens become chips only on surfaces where agent mentions are
  // an enabled feature (comment content and the comment composer mirror).
  // Everywhere else the text stays literal, matching the disabled pickers.
  const agentMentions = options?.renderAgentMentions
    ? parseAgentMentions(content)
    : [];

  if (mentions.length === 0 && agentMentions.length === 0) {
    return <>{content}</>;
  }

  const highlightClass =
    options?.mentionHighlightClassName ?? MENTION_HIGHLIGHT_CLASS;
  const mentionUsers = options?.resolveDisplayUsers === false ? undefined : options?.mentionUsers;

  // Agent tokens render the raw `@{Label}` text so transparent composer
  // mirrors keep exact text metrics with the underlying value.
  const items = [
    ...mentions.map((mention) => ({
      startIndex: mention.startIndex,
      endIndex: mention.endIndex,
      render: () => {
        const shouldHideDiscriminator =
          options?.hideMentionDiscriminator && mention.discriminator;
        const mentionContent = options?.preserveMentionText
          ? mention.fullMatch
          : `@${mention.username}`;

        return (
          <>
            <MentionText
              mention={{
                username: mention.username,
                discriminator: mention.discriminator,
              }}
              users={mentionUsers}
              className={highlightClass}
            >
              {mentionContent}
            </MentionText>
            {shouldHideDiscriminator ? (
              <span aria-hidden="true" className="hidden">
                #{mention.discriminator}
              </span>
            ) : null}
          </>
        );
      },
    })),
    ...agentMentions.map((mention) => ({
      startIndex: mention.startIndex,
      endIndex: mention.endIndex,
      render: () => <span className={highlightClass}>{mention.fullMatch}</span>,
    })),
  ].sort(
    (left, right) =>
      left.startIndex - right.startIndex || right.endIndex - left.endIndex
  );

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const item of items) {
    // Skip patterns already covered by a longer token at the same position.
    if (item.startIndex < lastIndex) {
      continue;
    }

    if (item.startIndex > lastIndex) {
      segments.push(content.slice(lastIndex, item.startIndex));
    }

    segments.push(
      <React.Fragment key={`mention-${item.startIndex}`}>
        {item.render()}
      </React.Fragment>
    );
    lastIndex = item.endIndex;
  }

  // Add remaining text after last mention using original content
  if (lastIndex < content.length) {
    segments.push(content.slice(lastIndex));
  }

  return <>{segments}</>;
}
