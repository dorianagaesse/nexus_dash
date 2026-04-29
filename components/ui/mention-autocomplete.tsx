"use client";

import {
  type MouseEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export interface MentionAutocompleteMember {
  id: string;
  displayName: string;
  usernameTag: string | null;
  avatarSeed: string;
  role: string;
  isOwner: boolean;
}

interface MentionAutocompleteProps {
  projectId: string;
  query: string;
  position: { top: number; left: number } | null;
  onSelect: (member: MentionAutocompleteMember) => void;
  onClose: () => void;
}

interface PanelLayout {
  top: number;
  left: number;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 8;
const DESKTOP_PANEL_WIDTH = 280;
const MOBILE_PANEL_WIDTH = 260;
const MAX_PANEL_HEIGHT = 280;
const MIN_PANEL_ITEMS = 4;

export function MentionAutocomplete({
  projectId,
  query,
  position,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [members, setMembers] = useState<MentionAutocompleteMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search members when query changes
  useEffect(() => {
    if (!position || query.length < 1) {
      setMembers([]);
      setError(null);
      return;
    }

    const searchMembers = async () => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/members/search?query=${encodeURIComponent(query)}`,
          { signal: abortControllerRef.current.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to load members");
        }

        const data = await response.json();
        setMembers(data.members ?? []);
        setActiveIndex(0);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // Ignore abort errors
          return;
        }
        setError("Could not load members");
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimeout = setTimeout(searchMembers, 150);
    return () => {
      clearTimeout(debounceTimeout);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [projectId, query, position]);

  // Calculate panel position
  useEffect(() => {
    if (!position || typeof window === "undefined") {
      setPanelLayout(null);
      return;
    }

    const calculateLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = position.left;
      let top = position.top + PANEL_GAP;

      const panelWidth = viewportWidth < 640 ? MOBILE_PANEL_WIDTH : DESKTOP_PANEL_WIDTH;

      // Adjust if would overflow right edge
      if (left + panelWidth + VIEWPORT_MARGIN > viewportWidth) {
        left = viewportWidth - panelWidth - VIEWPORT_MARGIN;
      }

      // Ensure minimum left
      if (left < VIEWPORT_MARGIN) {
        left = VIEWPORT_MARGIN;
      }

      // Calculate max height based on available space below
      const availableHeight = viewportHeight - top - VIEWPORT_MARGIN;
      const desiredHeight = Math.max(
        Math.min(MAX_PANEL_HEIGHT, availableHeight),
        MIN_PANEL_ITEMS * 48 // Minimum height for ~4 items
      );

      setPanelLayout({
        top,
        left,
        maxHeight: desiredHeight,
      });
    };

    calculateLayout();

    // Recalculate on resize
    window.addEventListener("resize", calculateLayout);
    return () => window.removeEventListener("resize", calculateLayout);
  }, [position]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!members.length) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % members.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + members.length) % members.length);
          break;
        case "Enter":
          event.preventDefault();
          if (members[activeIndex]) {
            onSelect(members[activeIndex]);
          }
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    },
    [members, activeIndex, onSelect, onClose]
  );

  // Mouse interaction on panel items
  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleItemClick = (member: MentionAutocompleteMember) => {
    onSelect(member);
  };

  // Don't render if no position or no query
  if (!position || query.length < 1) {
    return null;
  }

  // Don't render if panel layout not calculated yet
  if (!panelLayout) {
    return null;
  }

  const panel = (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Project members"
      className={cn(
        "fixed z-50 overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] backdrop-blur-sm",
        "transition-all duration-150 ease-out"
      )}
      style={{
        top: panelLayout.top,
        left: panelLayout.left,
        width: typeof window !== "undefined" && window.innerWidth < 640
          ? MOBILE_PANEL_WIDTH
          : DESKTOP_PANEL_WIDTH,
        maxHeight: panelLayout.maxHeight,
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="overflow-y-auto overflow-x-hidden p-1" style={{ maxHeight: panelLayout.maxHeight }}>
        {isLoading && (
          <div className="flex items-center justify-center px-3 py-4 text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-center justify-center px-3 py-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isLoading && !error && members.length === 0 && (
          <div className="flex items-center justify-center px-3 py-4 text-sm text-muted-foreground">
            No members found
          </div>
        )}

        {!isLoading && !error && members.length > 0 && (
          <div role="presentation" className="space-y-0.5">
            {members.map((member, index) => (
              <div
                key={member.id}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                  index === activeIndex
                    ? "bg-muted/70"
                    : "hover:bg-muted/40"
                )}
                onMouseEnter={() => handleMouseEnter(index)}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  handleItemClick(member);
                }}
              >
                <UserAvatar
                  avatarSeed={member.avatarSeed}
                  displayName={member.displayName}
                  className="h-8 w-8 shrink-0 border border-border/50"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {member.displayName}
                  </p>
                  {member.usernameTag && (
                    <p className="truncate text-xs text-muted-foreground leading-tight">
                      {member.usernameTag}
                    </p>
                  )}
                </div>
                {member.isOwner && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Owner
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Use portal to render at document body level
  if (typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }

  return panel;
}

/**
 * Hook to detect @mention query in a text input and provide cursor position.
 * Returns the query string (without @) and cursor position for autocomplete.
 */
export function useMentionAutocomplete(
  text: string,
  cursorPosition: number
): { isActive: boolean; query: string; position: { top: number; left: number } | null } {
  const [mentionState, setMentionState] = useState<{
    isActive: boolean;
    query: string;
    position: { top: number; left: number } | null;
  }>({
    isActive: false,
    query: "",
    position: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Find the @ symbol before cursor
    const textBeforeCursor = text.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) {
      setMentionState({ isActive: false, query: "", position: null });
      return;
    }

    // Check if there's a space between @ and cursor (meaning mention is complete)
    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
    if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
      setMentionState({ isActive: false, query: "", position: null });
      return;
    }

    // Check if cursor is right after @ (empty query) or has some text
    const query = textAfterAt;

    // Don't activate for empty query
    if (query.length < 1) {
      setMentionState({ isActive: false, query: "", position: null });
      return;
    }

    // Get cursor position in viewport
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setMentionState({ isActive: false, query: "", position: null });
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setMentionState({
      isActive: true,
      query,
      position: {
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      },
    });
  }, [text, cursorPosition]);

  return mentionState;
}
