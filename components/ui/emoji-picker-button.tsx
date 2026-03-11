"use client";

import { Clock3, Loader2, Search, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  buildNextRecentEmojis,
  type EmojiCatalog,
  findEmojiMatches,
  getCategoryIconEntry,
  getEmojiAssetUrl,
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

interface PanelLayout {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 8;
const DESKTOP_PANEL_WIDTH = 320;
const MOBILE_PANEL_WIDTH = 300;
const MAX_PANEL_HEIGHT = 360;
const MIN_PANEL_HEIGHT = 240;
const MAX_RECENT_PREVIEW = 6;

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
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
      setPanelLayout(null);
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePanelLayout = () => {
      if (!buttonRef.current || typeof window === "undefined") {
        return;
      }

      const triggerRect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredWidth =
        viewportWidth < 640 ? MOBILE_PANEL_WIDTH : DESKTOP_PANEL_WIDTH;
      const width = Math.min(preferredWidth, viewportWidth - VIEWPORT_MARGIN * 2);
      const left = Math.min(
        Math.max(triggerRect.right - width, VIEWPORT_MARGIN),
        viewportWidth - width - VIEWPORT_MARGIN
      );

      const availableBelow =
        viewportHeight - triggerRect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
      const availableAbove = triggerRect.top - PANEL_GAP - VIEWPORT_MARGIN;
      const shouldOpenAbove =
        availableBelow < MIN_PANEL_HEIGHT && availableAbove > availableBelow;
      const maxHeight = Math.max(
        Math.min(
          shouldOpenAbove ? availableAbove : availableBelow,
          MAX_PANEL_HEIGHT
        ),
        MIN_PANEL_HEIGHT
      );
      const top = shouldOpenAbove
        ? Math.max(VIEWPORT_MARGIN, triggerRect.top - PANEL_GAP - maxHeight)
        : Math.min(
            viewportHeight - VIEWPORT_MARGIN - maxHeight,
            triggerRect.bottom + PANEL_GAP
          );

      setPanelLayout({
        left,
        top,
        width,
        maxHeight,
      });
    };

    updatePanelLayout();
    window.addEventListener("resize", updatePanelLayout);
    window.addEventListener("scroll", updatePanelLayout, true);

    return () => {
      window.removeEventListener("resize", updatePanelLayout);
      window.removeEventListener("scroll", updatePanelLayout, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (panelRef.current && panelRef.current.contains(target)) ||
        (buttonRef.current && buttonRef.current.contains(target))
      ) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
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
    () =>
      catalog
        ? getRecentEmojiEntries(catalog, recentEmojis).slice(0, MAX_RECENT_PREVIEW)
        : [],
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
    <>
      <div className={cn("relative", className)}>
        <Button
          ref={buttonRef}
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
      </div>

      {isOpen && panelLayout && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[120] overflow-hidden rounded-2xl border border-border/70 bg-background/96 shadow-2xl backdrop-blur"
              style={{
                left: panelLayout.left,
                top: panelLayout.top,
                width: panelLayout.width,
                maxHeight: panelLayout.maxHeight,
              }}
            >
              <div className="flex max-h-[inherit] flex-col gap-3 p-3">
                <div className="relative shrink-0">
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
                  <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading emojis...
                  </div>
                ) : catalogError ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {catalogError}
                  </div>
                ) : catalog ? (
                  <>
                    <div className="flex shrink-0 items-center gap-1 overflow-x-auto pb-1 pr-1">
                      {catalog.groups.map((group) => {
                        const iconEntry = getCategoryIconEntry(catalog, group.id);

                        return (
                          <button
                            key={group.id}
                            type="button"
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition",
                              activeGroup?.id === group.id
                                ? "border-primary/40 bg-primary/12"
                                : "border-transparent bg-transparent hover:border-border/70 hover:bg-accent"
                            )}
                            onClick={() => setActiveGroupId(group.id)}
                            aria-label={group.label}
                            title={group.label}
                          >
                            {iconEntry ? (
                              <>
                                {/* External twemoji assets keep category icons consistent across OS emoji fonts. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={getEmojiAssetUrl(iconEntry)}
                                  alt=""
                                  aria-hidden="true"
                                  className="h-5 w-5"
                                  loading="lazy"
                                  draggable={false}
                                />
                                <span className="sr-only">{group.label}</span>
                              </>
                            ) : (
                              <span className="text-xs">{group.label}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
                        activeGroup ? (
                          <div className="space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                              {activeGroup.label}
                            </p>
                            <EmojiGrid
                              entries={activeGroup.entries}
                              onSelectEmoji={handleSelectEmoji}
                            />
                          </div>
                        ) : null
                      ) : searchResults.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <span>Results</span>
                            <span>{searchResults.length}</span>
                          </div>
                          <EmojiGrid entries={searchResults} onSelectEmoji={handleSelectEmoji} />
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                          No emoji matched that search yet.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

interface EmojiGridProps {
  entries: EmojiCatalog["entries"];
  onSelectEmoji: (emoji: string) => void;
}

function EmojiGrid({ entries, onSelectEmoji }: EmojiGridProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {entries.map((entry) => (
        <button
          key={entry.hexcode}
          type="button"
          className="flex h-10 items-center justify-center rounded-xl border border-transparent bg-muted/30 text-xl transition hover:border-border/70 hover:bg-accent"
          onClick={() => onSelectEmoji(entry.emoji)}
          aria-label={`Insert ${entry.hoverLabel} (${entry.name})`}
          title={entry.hoverLabel}
        >
          {/* External twemoji assets keep the picker consistent across OS emoji fonts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getEmojiAssetUrl(entry)}
            alt=""
            aria-hidden="true"
            className="h-6 w-6"
            loading="lazy"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}
