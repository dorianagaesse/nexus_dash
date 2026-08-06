"use client";

import { AlertTriangle, UserRound } from "lucide-react";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getMeetingTodoActorKey,
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
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

export function MeetingTodoAssigneeSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  label = "Assignee",
}: {
  id: string;
  value: MeetingTodoActorSummary | MeetingTodoActorReference | null;
  options: MeetingTodoActorSummary[];
  onChange: (value: MeetingTodoActorReference | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const currentValue = value ? getMeetingTodoActorKey(value) : "";
  const currentIsInactive = Boolean(
    value &&
      "isAssignable" in value &&
      !value.isAssignable &&
      !options.some((option) => getMeetingTodoActorKey(option) === currentValue)
  );
  const humans = options.filter((actor) => actor.kind === "human");
  const agents = options.filter((actor) => actor.kind === "agent");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={currentValue}
        disabled={disabled}
        onChange={(event) => {
          const [kind, actorId] = event.target.value.split(":", 2);
          onChange(
            (kind === "human" || kind === "agent") && actorId
              ? { kind, id: actorId }
              : null
          );
        }}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {currentIsInactive && value ? (
          <option value={currentValue} disabled>
            {"displayName" in value ? value.displayName : "Inactive actor"} — needs reassignment
          </option>
        ) : null}
        {humans.length > 0 ? (
          <optgroup label="Project members">
            {humans.map((actor) => (
              <option key={getMeetingTodoActorKey(actor)} value={getMeetingTodoActorKey(actor)}>
                {actor.displayName}{actor.usernameTag ? ` — ${actor.usernameTag}` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        {agents.length > 0 ? (
          <optgroup label="Project agents">
            {agents.map((actor) => (
              <option key={getMeetingTodoActorKey(actor)} value={getMeetingTodoActorKey(actor)}>
                {actor.displayName} (agent)
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
