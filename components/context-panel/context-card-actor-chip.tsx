import { UserRound } from "lucide-react";

import type { ProjectContextActorSummary } from "@/components/project-context-panel-types";
import { formatContextCardDate } from "@/components/project-context-panel-utils";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

interface ContextCardActorChipProps {
  actor: ProjectContextActorSummary | null;
  fallback: string;
  label?: string;
  timestamp?: string | null;
  className?: string;
}

const STATUS_LABEL: Record<ProjectContextActorSummary["status"], string> = {
  active: "active",
  inactive: "former member",
  revoked: "revoked credential",
  expired: "expired credential",
};

const CHIP_CLASS = "inline-flex items-center gap-1 text-[11px] text-slate-800";

export function ContextCardActorChip({
  actor,
  fallback,
  label,
  timestamp,
  className,
}: ContextCardActorChipProps) {
  const dateLabel = timestamp ? formatContextCardDate(timestamp) : "";

  if (!actor) {
    return (
      <span className={cn(CHIP_CLASS, className)}>
        <UserRound className="h-3 w-3" aria-hidden="true" />
        <span className="truncate">
          {label ? `${label}: ` : ""}
          {fallback}
          {dateLabel ? <span className="text-slate-600"> · {dateLabel}</span> : null}
        </span>
      </span>
    );
  }

  const statusLabel =
    actor.status === "active" ? "" : ` · ${STATUS_LABEL[actor.status]}`;

  return (
    <span className={cn(CHIP_CLASS, className)}>
      {actor.kind === "agent" ? (
        <AgentAvatar
          displayName={actor.displayName}
          decorative
          className="h-4 w-4"
        />
      ) : (
        <UserAvatar
          avatarSeed={actor.avatarSeed ?? actor.id}
          displayName={actor.displayName}
          decorative
          className="h-4 w-4"
        />
      )}
      <span className="truncate">
        {label ? `${label}: ` : ""}
        <span className="font-medium">{actor.displayName}</span>
        <span className="text-slate-600">{statusLabel}</span>
        {dateLabel ? <span className="text-slate-600"> · {dateLabel}</span> : null}
      </span>
    </span>
  );
}
