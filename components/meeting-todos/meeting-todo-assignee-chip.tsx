"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  UserRound,
} from "lucide-react";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getMeetingTodoActorKey,
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import { cn } from "@/lib/utils";

const POPOVER_VIEWPORT_PADDING = 12;
const POPOVER_MAX_HEIGHT = 320;
const POPOVER_OPTION_HEIGHT = 56;

interface AssigneeChipBaseProps {
  actor: MeetingTodoActorSummary | null;
  needsReassignment?: boolean;
  className?: string;
}

function AssigneeChipBase({
  actor,
  needsReassignment = false,
  className,
}: AssigneeChipBaseProps) {
  if (!actor) {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-muted/30 py-1 pl-1.5 pr-3 text-xs font-semibold text-muted-foreground",
          className
        )}
      >
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-border/70"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="truncate">Unassigned</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/40 p-1 pr-3 text-xs font-semibold text-foreground",
        needsReassignment && "border-amber-500/45 bg-amber-500/[0.08]",
        className
      )}
    >
      {actor.kind === "agent" ? (
        <AgentAvatar
          displayName={actor.displayName}
          decorative
          className="h-7 w-7 text-[10px]"
        />
      ) : actor.avatarSeed ? (
        <UserAvatar
          avatarSeed={actor.avatarSeed}
          displayName={actor.displayName}
          decorative
          className="h-7 w-7 text-[10px]"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/60 bg-primary/10 text-[10px] font-semibold text-primary"
        >
          {actor.displayName.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      <span className="max-w-36 truncate sm:max-w-52">
        {actor.displayName}
        {actor.kind === "agent" ? (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            agent
          </span>
        ) : null}
      </span>
      {needsReassignment ? (
        <span
          aria-label="Needs reassignment"
          className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

export function MeetingTodoAssigneeChipReadonly({
  actor,
  className,
}: {
  actor: MeetingTodoActorSummary | null;
  className?: string;
}) {
  const needsReassignment = actor !== null && !actor.isAssignable;
  return (
    <AssigneeChipBase
      actor={actor}
      needsReassignment={needsReassignment}
      className={className}
    />
  );
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function resolvePopoverPlacement({
  triggerRect,
  optionCount,
}: {
  triggerRect: DOMRect;
  optionCount: number;
}): PopoverPosition {
  const estimatedHeight = Math.min(
    Math.max(optionCount, 1) * POPOVER_OPTION_HEIGHT + 8,
    POPOVER_MAX_HEIGHT
  );
  const availableBelow =
    window.innerHeight - triggerRect.bottom - POPOVER_VIEWPORT_PADDING;
  const availableAbove = triggerRect.top - POPOVER_VIEWPORT_PADDING;
  const openAbove =
    availableBelow < estimatedHeight && availableAbove > availableBelow;
  const maxHeight = Math.max(
    140,
    Math.min(POPOVER_MAX_HEIGHT, (openAbove ? availableAbove : availableBelow) - 8)
  );
  const width = Math.min(
    Math.max(triggerRect.width, 260),
    window.innerWidth - POPOVER_VIEWPORT_PADDING * 2
  );
  const left = Math.min(
    Math.max(POPOVER_VIEWPORT_PADDING, triggerRect.left),
    window.innerWidth - width - POPOVER_VIEWPORT_PADDING
  );
  const top = openAbove
    ? Math.max(
        POPOVER_VIEWPORT_PADDING,
        triggerRect.top - Math.min(estimatedHeight, maxHeight) - 6
      )
    : triggerRect.bottom + 6;

  return { top, left, width, maxHeight };
}

interface MeetingTodoAssigneeChipProps {
  id: string;
  value: MeetingTodoActorSummary | MeetingTodoActorReference | null;
  options: MeetingTodoActorSummary[];
  onChange: (value: MeetingTodoActorReference | null) => void;
  disabled?: boolean;
  className?: string;
  pending?: boolean;
}

export function MeetingTodoAssigneeChip({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className,
  pending = false,
}: MeetingTodoAssigneeChipProps) {
  const generatedId = useId().replace(/:/g, "");
  const listboxId = `${id}-${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(
    null
  );

  const currentKey = value ? getMeetingTodoActorKey(value) : "";
  const currentActor = useMemo<MeetingTodoActorSummary | null>(() => {
    if (!value) {
      return null;
    }
    const matched = options.find(
      (option) => getMeetingTodoActorKey(option) === currentKey
    );
    if (matched) {
      return matched;
    }
    if ("displayName" in value) {
      return value as MeetingTodoActorSummary;
    }
    return null;
  }, [options, value, currentKey]);

  const isInactive = Boolean(
    currentActor && !currentActor.isAssignable
  );

  const humans = useMemo(
    () => options.filter((actor) => actor.kind === "human"),
    [options]
  );
  const agents = useMemo(
    () => options.filter((actor) => actor.kind === "agent"),
    [options]
  );

  useEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setPopoverPosition(
        resolvePopoverPlacement({
          triggerRect: rect,
          optionCount: humans.length + agents.length + 1,
        })
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, humans.length, agents.length]);

  const selectOption = (option: MeetingTodoActorReference | null) => {
    onChange(option);
    setIsOpen(false);
  };

  return (
    <span className={cn("relative inline-flex max-w-full", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled || pending}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-busy={pending || undefined}
        data-meeting-todo-assignee-chip="true"
        data-needs-reassignment={isInactive ? "true" : undefined}
        onClick={() => {
          if (disabled || pending) {
            return;
          }
          setIsOpen((previous) => !previous);
        }}
        className={cn(
          "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 p-1 pr-2.5 text-xs font-semibold text-foreground transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
          isInactive && "border-amber-500/45 bg-amber-500/[0.08]"
        )}
      >
        <AssigneeChipBase actor={currentActor} needsReassignment={isInactive} />
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
        <span className="sr-only">Change assignee</span>
      </button>

      {isOpen && popoverPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={listboxId}
              role="listbox"
              aria-label="Assign meeting todo"
              data-overlay-popover="true"
              className="pointer-events-auto fixed z-[140] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
                width: popoverPosition.width,
                maxHeight: popoverPosition.maxHeight,
              }}
            >
              <div
                className="space-y-0.5 overflow-y-auto"
                style={{ maxHeight: popoverPosition.maxHeight - 8 }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!currentActor}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => selectOption(null)}
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-border/70"
                  >
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      Unassigned
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Leave without an assignee
                    </span>
                  </span>
                  {!currentActor ? (
                    <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  ) : null}
                </button>

                {humans.length > 0 ? (
                  <div
                    role="presentation"
                    className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Project members
                  </div>
                ) : null}
                {humans.map((actor) => {
                  const key = getMeetingTodoActorKey(actor);
                  const isSelected = key === currentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => selectOption({ kind: actor.kind, id: actor.id })}
                    >
                      {actor.avatarSeed ? (
                        <UserAvatar
                          avatarSeed={actor.avatarSeed}
                          displayName={actor.displayName}
                          decorative
                          className="h-8 w-8 text-xs"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/60 bg-primary/10 text-xs font-semibold text-primary"
                        >
                          {actor.displayName.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {actor.displayName}
                          {actor.usernameTag ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {actor.usernameTag}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Project member
                        </span>
                      </span>
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                      ) : null}
                    </button>
                  );
                })}

                {agents.length > 0 ? (
                  <div
                    role="presentation"
                    className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Project agents
                  </div>
                ) : null}
                {agents.map((actor) => {
                  const key = getMeetingTodoActorKey(actor);
                  const isSelected = key === currentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => selectOption({ kind: actor.kind, id: actor.id })}
                    >
                      <AgentAvatar
                        displayName={actor.displayName}
                        decorative
                        className="h-8 w-8 text-xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {actor.displayName}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            agent
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Active credential
                        </span>
                      </span>
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
