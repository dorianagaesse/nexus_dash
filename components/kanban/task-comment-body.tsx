"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { MentionDisplayUser } from "@/components/ui/mention-hover-card";
import {
  COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM,
  measureCommentBodyOverflow,
} from "@/lib/comment-body-overflow";
import { renderContentWithMentions } from "@/lib/content-with-mentions";
import { cn } from "@/lib/utils";

interface TaskCommentBodyProps {
  commentId: string;
  content: string;
  mentionUsers?: MentionDisplayUser[];
  authorDisplayName?: string;
}

/**
 * Presents a task-comment body at a consistent collapsed height when it
 * overflows, with an accessible toggle that reveals and re-collapses it.
 * Short comments render at their natural height with no control.
 */
export function TaskCommentBody({
  commentId,
  content,
  mentionUsers,
  authorDisplayName,
}: TaskCommentBodyProps) {
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) {
      return;
    }

    const updateOverflowState = () => {
      setOverflowing(measureCommentBodyOverflow(element));
    };

    updateOverflowState();
    window.addEventListener("resize", updateOverflowState);
    return () => {
      window.removeEventListener("resize", updateOverflowState);
    };
  }, []);

  const bodyId = `task-comment-body-${commentId}`;
  const isCollapsed = overflowing && !expanded;
  const actionLabel = expanded ? "Show less" : "Show more";

  return (
    <div className="mt-1">
      <p
        ref={bodyRef}
        id={bodyId}
        className="whitespace-pre-wrap break-words text-sm text-foreground"
        style={
          isCollapsed
            ? {
                maxHeight: `${COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM}rem`,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {renderContentWithMentions(content, { mentionUsers })}
      </p>
      {overflowing ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={
            authorDisplayName
              ? `${actionLabel} of ${authorDisplayName}'s comment`
              : actionLabel
          }
          onClick={() => setExpanded((currentExpanded) => !currentExpanded)}
          className="mt-1 inline-flex cursor-pointer items-center gap-0.5 rounded-sm px-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {actionLabel}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5",
              expanded ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
