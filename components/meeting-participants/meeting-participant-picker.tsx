"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus, X } from "lucide-react";

import { MeetingParticipantAvatar } from "@/components/meeting-participants/meeting-participant-avatar";
import { Button } from "@/components/ui/button";
import { formatProjectCollaboratorRole } from "@/lib/project-collaborator-role";
import {
  getMeetingParticipantKey,
  normalizeMeetingParticipantName,
  type ProjectMeetingParticipantCollaborator,
  type ProjectMeetingParticipantIdentity,
} from "@/lib/meeting-participant";
import { cn } from "@/lib/utils";

interface MeetingParticipantPickerProps {
  id: string;
  value: ProjectMeetingParticipantIdentity[];
  inputValue: string;
  collaborators: ProjectMeetingParticipantCollaborator[];
  previousExternalParticipants: ProjectMeetingParticipantIdentity[];
  onInputValueChange: (value: string) => void;
  onChange: (value: ProjectMeetingParticipantIdentity[]) => void;
  maxItems?: number;
  maxInputLength?: number;
  disabled?: boolean;
}

interface ParticipantSuggestion {
  participant: ProjectMeetingParticipantIdentity;
  source: "collaborator" | "previous-external";
  projectRole?: ProjectMeetingParticipantCollaborator["projectRole"];
}

function matchesQuery(suggestion: ParticipantSuggestion, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    suggestion.participant.displayName,
    suggestion.participant.usernameTag ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function MeetingParticipantPicker({
  id,
  value,
  inputValue,
  collaborators,
  previousExternalParticipants,
  onInputValueChange,
  onChange,
  maxItems = 40,
  maxInputLength = 80,
  disabled = false,
}: MeetingParticipantPickerProps) {
  const generatedId = useId().replace(/:/g, "");
  const listboxId = `${id}-${generatedId}-suggestions`;
  const helperId = `${id}-${generatedId}-helper`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const selectedKeys = useMemo(
    () => new Set(value.map((participant) => getMeetingParticipantKey(participant))),
    [value]
  );
  const allSuggestions = useMemo(() => {
    const suggestions: ParticipantSuggestion[] = [];
    const seen = new Set<string>();

    for (const collaborator of collaborators) {
      const participant: ProjectMeetingParticipantIdentity = {
        userId: collaborator.id,
        displayName: collaborator.displayName,
        usernameTag: collaborator.usernameTag,
        avatarSeed: collaborator.avatarSeed,
      };
      const key = getMeetingParticipantKey(participant);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({
        participant,
        source: "collaborator",
        projectRole: collaborator.projectRole,
      });
    }

    for (const participant of previousExternalParticipants) {
      const key = getMeetingParticipantKey(participant);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({ participant, source: "previous-external" });
    }

    return suggestions;
  }, [collaborators, previousExternalParticipants]);
  const availableSuggestions = useMemo(() => {
    const query = normalizeMeetingParticipantName(inputValue).toLocaleLowerCase();
    return allSuggestions
      .filter(
        (suggestion) =>
          !selectedKeys.has(getMeetingParticipantKey(suggestion.participant))
      )
      .filter((suggestion) => matchesQuery(suggestion, query))
      .slice(0, 10);
  }, [allSuggestions, inputValue, selectedKeys]);

  const canAddMore = value.length < maxItems;
  const normalizedInput = normalizeMeetingParticipantName(inputValue);

  useEffect(() => {
    if (!isOpen || availableSuggestions.length === 0) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex(normalizedInput ? 0 : -1);
  }, [availableSuggestions.length, isOpen, normalizedInput]);

  useEffect(() => {
    if (!isOpen) {
      setDropdownPosition(null);
      return;
    }

    const updateDropdownPosition = () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const viewportPadding = 12;
      const estimatedHeight = Math.min(
        Math.max(availableSuggestions.length, 1) * 56 + 8,
        288
      );
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const openAbove =
        availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        112,
        Math.min(
          288,
          (openAbove ? availableAbove : availableBelow) - 8
        )
      );
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding
      );

      setDropdownPosition({
        top: openAbove
          ? Math.max(viewportPadding, rect.top - Math.min(estimatedHeight, maxHeight) - 6)
          : rect.bottom + 6,
        left,
        width,
        maxHeight,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [availableSuggestions.length, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const addParticipant = (participant: ProjectMeetingParticipantIdentity) => {
    if (!canAddMore) {
      return;
    }

    const key = getMeetingParticipantKey(participant);
    if (selectedKeys.has(key)) {
      onInputValueChange("");
      setIsOpen(false);
      return;
    }

    onChange([...value, participant]);
    onInputValueChange("");
    setAnnouncement(`${participant.displayName} added as a participant.`);
    setIsOpen(false);
  };

  const addInputValue = () => {
    if (!normalizedInput || !canAddMore) {
      return;
    }

    const exactSuggestion = allSuggestions.find((suggestion) => {
      const displayName =
        suggestion.participant.displayName.toLocaleLowerCase();
      const usernameTag =
        suggestion.participant.usernameTag?.toLocaleLowerCase() ?? "";
      const input = normalizedInput.toLocaleLowerCase();
      return displayName === input || usernameTag === input;
    });

    addParticipant(
      exactSuggestion?.participant ?? {
        userId: null,
        displayName: normalizedInput,
        usernameTag: null,
        avatarSeed: null,
      }
    );
  };

  const selectActiveSuggestion = (): boolean => {
    const suggestion = availableSuggestions[activeIndex];
    if (!suggestion) {
      return false;
    }
    addParticipant(suggestion.participant);
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && availableSuggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current < availableSuggestions.length - 1 ? current + 1 : 0
      );
      return;
    }

    if (event.key === "ArrowUp" && availableSuggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current > 0 ? current - 1 : availableSuggestions.length - 1
      );
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      if (selectActiveSuggestion() || normalizedInput) {
        event.preventDefault();
        if (activeIndex < 0) {
          addInputValue();
        }
      }
      return;
    }

    if (event.key === "Tab" && normalizedInput) {
      if (!selectActiveSuggestion()) {
        addInputValue();
      }
      return;
    }

    if (event.key === "Backspace" && !inputValue && value.length > 0) {
      event.preventDefault();
      const removed = value[value.length - 1];
      onChange(value.slice(0, -1));
      if (removed) {
        setAnnouncement(`${removed.displayName} removed.`);
      }
    }
  };

  const dropdown =
    isOpen &&
    dropdownPosition &&
    availableSuggestions.length > 0 &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            aria-label="Participant suggestions"
            data-overlay-popover="true"
            className="pointer-events-auto fixed z-[140] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            <div
              className="space-y-0.5 overflow-y-auto"
              style={{ maxHeight: dropdownPosition.maxHeight - 8 }}
            >
              {availableSuggestions.map((suggestion, index) => {
                const participant = suggestion.participant;
                const optionId = `${listboxId}-option-${index}`;
                return (
                  <button
                    key={getMeetingParticipantKey(participant)}
                    id={optionId}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                      index === activeIndex
                        ? "bg-muted"
                        : "hover:bg-muted/60 focus-visible:bg-muted"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addParticipant(participant)}
                  >
                    <MeetingParticipantAvatar
                      participant={participant}
                      className="h-8 w-8 text-xs"
                      decorative
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {participant.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.source === "collaborator"
                          ? `${formatProjectCollaboratorRole(
                              suggestion.projectRole ?? "viewer"
                            )}${
                              participant.usernameTag
                                ? ` · ${participant.usernameTag}`
                                : ""
                            }`
                          : "Previous guest"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-1.5">
      <div
        ref={rootRef}
        className={cn(
          "rounded-lg border border-input bg-background p-1.5 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          disabled && "opacity-60"
        )}
      >
        <div className="flex min-h-10 flex-wrap items-center gap-1.5">
          {value.map((participant) => (
            <span
              key={getMeetingParticipantKey(participant)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 p-1 pr-1.5 text-xs font-semibold text-foreground"
            >
              <MeetingParticipantAvatar
                participant={participant}
                className="h-7 w-7 text-[10px]"
                decorative
              />
              <span className="max-w-36 truncate sm:max-w-52">
                {participant.displayName}
              </span>
              <button
                type="button"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => {
                  onChange(
                    value.filter(
                      (candidate) =>
                        getMeetingParticipantKey(candidate) !==
                        getMeetingParticipantKey(participant)
                    )
                  );
                  setAnnouncement(`${participant.displayName} removed.`);
                }}
                disabled={disabled}
                aria-label={`Remove ${participant.displayName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen && availableSuggestions.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            aria-describedby={helperId}
            value={inputValue}
            onChange={(event) => {
              onInputValueChange(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (!disabled && canAddMore) {
                setIsOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => {
                const activeElement = document.activeElement;
                if (
                  activeElement &&
                  !rootRef.current?.contains(activeElement) &&
                  !dropdownRef.current?.contains(activeElement)
                ) {
                  setIsOpen(false);
                }
              }, 0);
            }}
            onKeyDown={handleKeyDown}
            maxLength={maxInputLength}
            disabled={disabled || !canAddMore}
            className="h-10 min-w-[120px] flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={canAddMore ? "Search or type a name" : "Participant limit reached"}
            autoComplete="off"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            onClick={addInputValue}
            disabled={disabled || !canAddMore || !normalizedInput}
            aria-label={
              normalizedInput
                ? `Add ${normalizedInput} as a participant`
                : "Add participant"
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p id={helperId} className="text-xs leading-5 text-muted-foreground">
        Search collaborators or previous guests. Press Tab, Enter, or + to add a name.
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {dropdown}
    </div>
  );
}
