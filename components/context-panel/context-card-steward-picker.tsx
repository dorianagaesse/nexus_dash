import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { ContextCardActorChip } from "@/components/context-panel/context-card-actor-chip";
import type { ProjectContextActorSummary } from "@/components/project-context-panel-types";
import { cn } from "@/lib/utils";

interface ContextCardStewardPickerProps {
  actors: ProjectContextActorSummary[];
  selected: ProjectContextActorSummary | null;
  cleared: boolean;
  disabled: boolean;
  onChange: (actor: ProjectContextActorSummary | null) => void;
}

function actorKey(actor: ProjectContextActorSummary): string {
  return `${actor.kind}:${actor.id}`;
}

function sameActor(
  a: ProjectContextActorSummary | null,
  b: ProjectContextActorSummary | null
): boolean {
  if (!a || !b) {
    return false;
  }
  return actorKey(a) === actorKey(b);
}

export function ContextCardStewardPicker({
  actors,
  selected,
  cleared,
  disabled,
  onChange,
}: ContextCardStewardPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonId = useId();
  const listId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const filteredActors = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return actors;
    }
    return actors.filter((actor) =>
      actor.displayName.toLowerCase().includes(trimmed)
    );
  }, [actors, query]);

  const summary: ProjectContextActorSummary | null = cleared
    ? null
    : selected;

  return (
    <div className="flex items-center gap-2">
      <div ref={containerRef} className="relative flex-1">
        <button
          id={buttonId}
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm",
            disabled && "opacity-60"
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span className="truncate text-left">
            {summary ? summary.displayName : "Unassigned"}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        {isOpen ? (
          <div
            className="absolute z-10 mt-1 flex max-h-64 w-full flex-col rounded-md border border-border/60 bg-popover shadow-md"
            role="dialog"
          >
            <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members or agents"
                className="h-8 w-full bg-transparent text-xs outline-none"
              />
            </div>
            <ul
              id={listId}
              role="listbox"
              className="max-h-56 overflow-y-auto py-1 text-sm"
            >
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={summary === null}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/60",
                    summary === null && "bg-muted/40"
                  )}
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">Unassigned</span>
                </button>
              </li>
              {filteredActors.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No matching assignable members.
                </li>
              ) : (
                filteredActors.map((actor) => (
                  <li key={actorKey(actor)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={sameActor(summary, actor)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/60",
                        sameActor(summary, actor) && "bg-muted/40"
                      )}
                      onClick={() => {
                        onChange(actor);
                        setIsOpen(false);
                      }}
                    >
                      <ContextCardActorChip
                        actor={actor}
                        fallback={actor.displayName}
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="flex h-10 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground"
        disabled={disabled || (!summary && !cleared)}
        onClick={() => {
          onChange(null);
          setQuery("");
        }}
        aria-label="Clear steward"
      >
        <X className="h-3 w-3" />
        Clear
      </button>
    </div>
  );
}
