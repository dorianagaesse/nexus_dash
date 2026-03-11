"use client";

import { Clock3, Loader2, Search, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import {
  buildNextRecentEmojis,
  type EmojiCatalog,
  findEmojiMatches,
  getRecentEmojiEntries,
  EMOJI_RECENTS_STORAGE_KEY,
  loadEmojiCatalog,
  normalizeRecentEmojis,
} from "@/lib/emoji";
import { cn } from "@/lib/utils";

interface EmojiPickerButtonProps {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
  presentation?: "default" | "field";
}

export function EmojiPickerButton({
  onSelectEmoji,
  disabled = false,
  className,
  presentation = "default",
}: EmojiPickerButtonProps) {
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useDismissibleMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedRecents = window.localStorage.getItem(EMOJI_RECENTS_STORAGE_KEY);
      if (!storedRecents) {
        return;
      }

      const parsedRecents = JSON.parse(storedRecents);
      setRecentEmojis(normalizeRecentEmojis(parsedRecents));
    } catch (error) {
      console.error("[EmojiPickerButton.loadRecents]", error);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCatalogError(null);

    if (!catalog) {
      setIsLoadingCatalog(true);
      loadEmojiCatalog()
        .then((loadedCatalog) => {
          setCatalog(loadedCatalog);
          setActiveGroupId((previous) => previous || loadedCatalog.groups[0]?.id || "");
        })
        .catch((error) => {
          console.error("[EmojiPickerButton.loadCatalog]", error);
          setCatalogError("We couldn't load emojis right now.");
        })
        .finally(() => setIsLoadingCatalog(false));
    }
  }, [catalog, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [isOpen]);

  useEffect(() => {
    if (catalog && !catalog.groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(catalog.groups[0]?.id || "");
    }
  }, [activeGroupId, catalog]);

  const activeGroup = useMemo(
    () => catalog?.groups.find((group) => group.id === activeGroupId) ?? catalog?.groups[0] ?? null,
    [activeGroupId, catalog]
  );

  const recentEntries = useMemo(
    () => (catalog ? getRecentEmojiEntries(catalog, recentEmojis) : []),
    [catalog, recentEmojis]
  );

  const searchResults = useMemo(
    () => (catalog ? findEmojiMatches(catalog.entries, searchQuery) : []),
    [catalog, searchQuery]
  );

  const handleSelectEmoji = (emoji: string) => {
    onSelectEmoji(emoji);
    setIsOpen(false);
    setRecentEmojis((previous) => {
      const nextRecents = buildNextRecentEmojis(previous, emoji);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, JSON.stringify(nextRecents));
        } catch (error) {
          console.error("[EmojiPickerButton.persistRecents]", error);
        }
      }

      return nextRecents;
    });
  };

  const isFieldPresentation = presentation === "field";
  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <Button
        type="button"
        size={isFieldPresentation ? "icon" : "sm"}
        variant={isOpen ? "secondary" : "outline"}
        className={cn(
          "text-muted-foreground",
          isFieldPresentation
            ? "h-7 w-7 rounded-full border-border/70 bg-background/90 shadow-sm backdrop-blur"
            : "h-8 px-2.5 text-xs"
        )}
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="Insert emoji"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <SmilePlus className="h-3.5 w-3.5" />
        {isFieldPresentation ? <span className="sr-only">Emoji</span> : "Emoji"}
      </Button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-border/70 bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search emoji or :shortcode:"
                className="h-10 w-full rounded-full border border-border/70 bg-muted/30 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
            </div>

            {isLoadingCatalog ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading emojis...
              </div>
            ) : catalogError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {catalogError}
              </div>
            ) : catalog ? (
              <>
                {!hasSearchQuery && recentEntries.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Recent
                    </div>
                    <EmojiGrid entries={recentEntries} onSelectEmoji={handleSelectEmoji} />
                  </div>
                ) : null}

                {!hasSearchQuery ? (
                  <>
                    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
                      {catalog.groups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                            activeGroup?.id === group.id
                              ? "border-foreground/20 bg-foreground text-background"
                              : "border-border/70 bg-background text-muted-foreground hover:bg-accent"
                          )}
                          onClick={() => setActiveGroupId(group.id)}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>

                    {activeGroup ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          {activeGroup.label}
                        </p>
                        <div className="max-h-72 overflow-y-auto pr-1">
                          <EmojiGrid entries={activeGroup.entries} onSelectEmoji={handleSelectEmoji} />
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      <span>Results</span>
                      <span>{searchResults.length}</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto pr-1">
                      {searchResults.length > 0 ? (
                        <EmojiGrid entries={searchResults} onSelectEmoji={handleSelectEmoji} />
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                          No emoji matched that search yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface EmojiGridProps {
  entries: EmojiCatalog["entries"];
  onSelectEmoji: (emoji: string) => void;
}

function EmojiGrid({ entries, onSelectEmoji }: EmojiGridProps) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {entries.map((entry) => (
        <button
          key={entry.hexcode}
          type="button"
          className="flex h-10 items-center justify-center rounded-xl border border-transparent bg-muted/30 text-xl transition hover:border-border/70 hover:bg-accent"
          onClick={() => onSelectEmoji(entry.emoji)}
          aria-label={`Insert ${entry.hoverLabel} (${entry.name})`}
          title={entry.hoverLabel}
        >
          <span aria-hidden="true">{entry.emoji}</span>
        </button>
      ))}
    </div>
  );
}
