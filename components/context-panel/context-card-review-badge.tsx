import { AlertTriangle, Clock } from "lucide-react";

import type { ProjectContextReviewState } from "@/components/project-context-panel-types";
import { cn } from "@/lib/utils";

interface ContextCardReviewBadgeProps {
  review: ProjectContextReviewState;
  className?: string;
}

function formatRelativeDays(days: number): string {
  if (days <= 1) {
    return "today";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function daysSinceLastEdit(lastEditedAt: string, now: Date = new Date()): number {
  const lastEdited = new Date(lastEditedAt).getTime();
  if (Number.isNaN(lastEdited)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - lastEdited) / (24 * 60 * 60 * 1000)));
}

export function ContextCardReviewBadge({
  review,
  className,
}: ContextCardReviewBadgeProps) {
  const days = daysSinceLastEdit(review.lastEditedAt);
  const tone = review.needsReview
    ? "border-amber-500/50 bg-amber-100/80 text-amber-900"
    : "border-border/60 bg-background/70 text-muted-foreground";
  const Icon = review.needsReview ? AlertTriangle : Clock;
  const label = review.needsReview
    ? `Needs review (${review.thresholdDays}d)`
    : `Reviewed ${formatRelativeDays(days)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className
      )}
      title={
        review.needsReview
          ? `Last edited more than ${review.thresholdDays} days ago`
          : `Last edited ${formatRelativeDays(days)}`
      }
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
