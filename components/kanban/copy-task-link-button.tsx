"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildTaskUrl } from "@/lib/task-url";

export function CopyTaskLinkButton({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(buildTaskUrl(projectId, taskId), window.location.origin).href
      );
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  }

  return (
    <div className="flex max-w-32 flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void copyLink()}
      >
        {feedback === "copied" ? (
          <Check className="h-4 w-4" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {feedback === "copied" ? "Copied" : "Copy link"}
      </Button>
      <span
        role="status"
        className={feedback === "failed" ? "max-w-40 text-xs text-destructive" : "sr-only"}
      >
        {feedback === "failed"
          ? "Could not copy. Copy the URL from your address bar."
          : feedback === "copied"
            ? "Task link copied."
            : ""}
      </span>
    </div>
  );
}
