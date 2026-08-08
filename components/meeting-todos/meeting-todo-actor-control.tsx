"use client";

import { AlertTriangle, UserRound } from "lucide-react";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";
import { cn } from "@/lib/utils";

export function MeetingTodoActorIdentity({
  actor,
  prefix = "Assigned to",
  compact = false,
}: {
  actor: MeetingTodoActorSummary | null;
  prefix?: string;
  compact?: boolean;
}) {
  if (!actor) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-border">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        </span>
        {prefix} unassigned
      </span>
    );
  }

  const needsReassignment = !actor.isAssignable;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-xs",
        needsReassignment ? "text-amber-700 dark:text-amber-200" : "text-muted-foreground"
      )}
    >
      {actor.kind === "agent" ? (
        <AgentAvatar displayName={actor.displayName} decorative className="h-6 w-6" />
      ) : actor.avatarSeed ? (
        <UserAvatar
          avatarSeed={actor.avatarSeed}
          displayName={actor.displayName}
          decorative
          className="h-6 w-6"
        />
      ) : (
        <span className="grid h-6 w-6 place-items-center rounded-full border border-border bg-muted">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <span className={cn("min-w-0", compact && "truncate")}>
        {prefix} <span className="font-medium text-foreground">{actor.displayName}</span>
        {actor.kind === "agent" ? " (agent)" : ""}
      </span>
      {needsReassignment ? (
        <span className="inline-flex items-center gap-1 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Needs reassignment
        </span>
      ) : null}
    </span>
  );
}
