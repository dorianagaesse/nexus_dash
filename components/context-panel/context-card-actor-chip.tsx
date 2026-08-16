import { Bot, UserRound } from "lucide-react";

import type { ProjectContextActorSummary } from "@/components/project-context-panel-types";
import { cn } from "@/lib/utils";

interface ContextCardActorChipProps {
  actor: ProjectContextActorSummary | null;
  fallback: string;
  label?: string;
  className?: string;
}

const STATUS_LABEL: Record<ProjectContextActorSummary["status"], string> = {
  active: "active",
  inactive: "former member",
  revoked: "revoked credential",
  expired: "expired credential",
};

export function ContextCardActorChip({
  actor,
  fallback,
  label,
  className,
}: ContextCardActorChipProps) {
  if (!actor) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground",
          className
        )}
      >
        <UserRound className="h-3 w-3" aria-hidden="true" />
        <span className="truncate">{label ? `${label}: ` : ""}{fallback}</span>
      </span>
    );
  }

  const Icon = actor.kind === "agent" ? Bot : UserRound;
  const statusLabel =
    actor.status === "active" ? "" : ` · ${STATUS_LABEL[actor.status]}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-slate-800",
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="truncate">
        {label ? `${label}: ` : ""}
        <span className="font-medium">{actor.displayName}</span>
        <span className="text-muted-foreground">{statusLabel}</span>
      </span>
    </span>
  );
}
