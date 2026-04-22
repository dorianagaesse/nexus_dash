"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import type {
  ProjectTaskCollaborator,
} from "@/components/kanban-board-types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatProjectCollaboratorRole } from "@/lib/project-collaborator-role";
import { cn } from "@/lib/utils";

interface AssigneeSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: ProjectTaskCollaborator[];
  disabled?: boolean;
  className?: string;
  unassignedLabel?: string;
}

function buildAssigneeHoverLabel(assignee: ProjectTaskCollaborator): string {
  return assignee.usernameTag ?? assignee.displayName;
}

export function AssigneeSelect({
  id,
  name,
  value,
  onChange,
  options,
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

  const selectedAssignee = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
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
      const estimatedHeight = Math.min(56 * (options.length + 1), 280);
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
  }, [isOpen, options.length]);

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
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
            <UserAvatar
              avatarSeed={selectedAssignee.avatarSeed}
              displayName={selectedAssignee.displayName}
              className="h-8 w-8 border-border/70"
              decorative
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedAssignee.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatProjectCollaboratorRole(selectedAssignee.projectRole)}
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
              className="z-[140] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
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
                    onChange("");
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

                {options.map((assignee) => {
                  const isSelected = assignee.id === selectedAssignee?.id;

                  return (
                    <button
                      key={assignee.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      title={buildAssigneeHoverLabel(assignee)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted"
                      onClick={() => {
                        onChange(assignee.id);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          avatarSeed={assignee.avatarSeed}
                          displayName={assignee.displayName}
                          className="h-9 w-9 border-border/70"
                          decorative
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {assignee.displayName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatProjectCollaboratorRole(assignee.projectRole)}
                          </p>
                        </div>
                      </div>
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
