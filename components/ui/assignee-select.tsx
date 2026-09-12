"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";

import type { ProjectTaskCollaborator } from "@/components/kanban-board-types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getProjectActorKey,
  type ProjectActorReference,
  type ProjectActorSummary,
} from "@/lib/project-actor";
import { formatProjectCollaboratorRole } from "@/lib/project-collaborator-role";
import { cn } from "@/lib/utils";

interface AssigneeSelectProps {
  id?: string;
  value: ProjectActorSummary | ProjectActorReference | null;
  onChange: (value: ProjectActorReference | null) => void;
  options: ProjectTaskCollaborator[];
  agentOptions?: ProjectActorSummary[];
  disabled?: boolean;
  className?: string;
  unassignedLabel?: string;
}

interface AssigneeOptionView {
  key: string;
  actor: ProjectActorSummary;
  subtitle: string;
  agent: boolean;
}

function buildAssigneeHoverLabel(
  actor: Pick<ProjectActorSummary, "displayName" | "usernameTag">
): string {
  return actor.usernameTag ?? actor.displayName;
}

function AssigneeAvatar({
  actor,
  className,
}: {
  actor: ProjectActorSummary;
  className?: string;
}) {
  if (actor.kind === "agent") {
    return <AgentAvatar displayName={actor.displayName} decorative className={className} />;
  }
  if (actor.avatarSeed) {
    return (
      <UserAvatar
        avatarSeed={actor.avatarSeed}
        displayName={actor.displayName}
        className={cn(className, "border-border/70")}
        decorative
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-border/60 bg-primary/10 text-xs font-semibold text-primary",
        className
      )}
    >
      {actor.displayName.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function AssigneeSelect({
  id,
  value,
  onChange,
  options,
  agentOptions = [],
  disabled = false,
  className,
  unassignedLabel = "Unassigned",
}: AssigneeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const optionViews = useMemo<AssigneeOptionView[]>(
    () => [
      ...options.map((collaborator) => ({
        key: getProjectActorKey({ kind: "human" as const, id: collaborator.id }),
        actor: {
          kind: "human" as const,
          id: collaborator.id,
          displayName: collaborator.displayName,
          usernameTag: collaborator.usernameTag,
          avatarSeed: collaborator.avatarSeed,
          status: "active" as const,
          isAssignable: true,
        },
        subtitle: formatProjectCollaboratorRole(collaborator.projectRole),
        agent: false,
      })),
      ...agentOptions.map((agent) => ({
        key: getProjectActorKey(agent),
        actor: agent,
        subtitle: agent.isAssignable ? "Agent credential" : "Agent credential — inactive",
        agent: true,
      })),
    ],
    [agentOptions, options]
  );

  const selectedKey = value ? getProjectActorKey(value) : "";
  const selectedAssignee = useMemo<ProjectActorSummary | null>(() => {
    if (!value) {
      return null;
    }

    const matched = optionViews.find((option) => option.key === selectedKey);
    if (matched) {
      return matched.actor;
    }

    if ("displayName" in value) {
      return value;
    }

    return null;
  }, [optionViews, selectedKey, value]);

  const needsReassignment = Boolean(
    selectedAssignee && !selectedAssignee.isAssignable
  );

  useEffect(() => {
    if (!isOpen) {
      setDropdownPosition(null);
      return;
    }

    const updateDropdownPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const estimatedHeight = Math.min(
        56 * (optionViews.length + 1),
        280
      );
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const shouldOpenAbove =
        availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        140,
        shouldOpenAbove ? availableAbove - 6 : availableBelow - 6
      );

      setDropdownPosition({
        top: shouldOpenAbove
          ? Math.max(viewportPadding, rect.top - Math.min(estimatedHeight, maxHeight) - 6)
          : rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 260),
        maxHeight,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateDropdownPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, optionViews.length]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-60",
          needsReassignment && "border-amber-500/45 bg-amber-500/[0.08]",
          className
        )}
        onClick={() => {
          if (disabled) {
            return;
          }

          setIsOpen((previous) => !previous);
        }}
        title={selectedAssignee ? buildAssigneeHoverLabel(selectedAssignee) : undefined}
      >
        {selectedAssignee ? (
          <div className="flex min-w-0 items-center gap-3">
            <AssigneeAvatar
              actor={selectedAssignee}
              className="h-8 w-8 border-border/70"
            />
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-foreground">
                <span className="truncate">{selectedAssignee.displayName}</span>
                {selectedAssignee.kind === "agent" ? (
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    agent
                  </span>
                ) : null}
                {needsReassignment ? (
                  <AlertTriangle
                    aria-label="Needs reassignment"
                    className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300"
                  />
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {needsReassignment ? "Needs reassignment" : "Current assignee"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 rounded-full border border-dashed border-border/70 bg-muted/30" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{unassignedLabel}</p>
              <p className="truncate text-xs text-muted-foreground">No owner yet</p>
            </div>
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && dropdownPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              data-overlay-popover="true"
              className="pointer-events-auto z-[140] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
              style={{
                position: "fixed",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                maxHeight: dropdownPosition.maxHeight,
              }}
            >
              <div className="scrollbar-hidden space-y-1 overflow-y-auto p-0.5">
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedAssignee}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted"
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 rounded-full border border-dashed border-border/70 bg-muted/30" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {unassignedLabel}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Leave without an assignee
                      </p>
                    </div>
                  </div>
                  {!selectedAssignee ? <Check className="h-4 w-4 text-foreground" /> : null}
                </button>

                {optionViews.map((option) => {
                  const isSelected = option.key === selectedKey;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      title={buildAssigneeHoverLabel(option.actor)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted"
                      onClick={() => {
                        onChange({ kind: option.actor.kind, id: option.actor.id });
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <AssigneeAvatar actor={option.actor} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {option.actor.displayName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {option.subtitle}
                          </p>
                        </div>
                      </div>
                      {option.agent ? (
                        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Agent
                        </span>
                      ) : null}
                      {isSelected ? <Check className="h-4 w-4 text-foreground" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
