"use client";

import React from "react";

import {
  MentionText,
  type MentionDisplayUser,
} from "@/components/ui/mention-hover-card";
import { parseMentions } from "@/lib/mention";

/**
 * Renders content with @username mentions highlighted.
 * Splits content into segments and wraps mention patterns in styled spans.
 */
export function renderContentWithMentions(
  content: string,
  options?: {
    mentionHighlightClassName?: string;
    mentionUsers?: MentionDisplayUser[];
    preserveMentionLayout?: boolean;
    preserveMentionText?: boolean;
    resolveDisplayUsers?: boolean;
  }
): React.ReactNode {
  const { mentions } = parseMentions(content);

  if (mentions.length === 0) {
    return <>{content}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  const highlightClass = options?.mentionHighlightClassName ?? [
    "rounded-md bg-primary/15 px-1 py-0.5",
    "font-medium text-primary",
    "not-italic",
  ].join(" ");
  const mentionUsers = options?.resolveDisplayUsers === false ? undefined : options?.mentionUsers;

  for (const mention of mentions) {
    // Add text before the mention using original content indices
    if (mention.startIndex > lastIndex) {
      segments.push(content.slice(lastIndex, mention.startIndex));
    }

    const shouldPreserveMentionLayout =
      options?.preserveMentionLayout && mention.discriminator;
    const mentionContent = options?.preserveMentionText ? (
      mention.fullMatch
    ) : shouldPreserveMentionLayout ? (
      <>
        @{mention.username}
        <span aria-hidden="true" className="text-transparent">
          #{mention.discriminator}
        </span>
      </>
    ) : (
      `@${mention.username}`
    );

    segments.push(
      <MentionText
        key={`mention-${mention.startIndex}`}
        mention={{
          username: mention.username,
          discriminator: mention.discriminator,
        }}
        users={mentionUsers}
        className={highlightClass}
      >
        {mentionContent}
      </MentionText>
    );

    lastIndex = mention.endIndex;
  }

  // Add remaining text after last mention using original content
  if (lastIndex < content.length) {
    segments.push(content.slice(lastIndex));
  }

  return <>{segments}</>;
}
