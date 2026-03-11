"use client";

import { Clock3, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import {
  buildNextRecentEmojis,
  EMOJI_GROUPS,
  EMOJI_RECENTS_STORAGE_KEY,
  getEmojiGroupById,
} from "@/lib/emoji";
import { cn } from "@/lib/utils";

interface EmojiPickerButtonProps {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
}

export function EmojiPickerButton({
  onSelectEmoji,
  disabled = false,
  className,
}: EmojiPickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(EMOJI_GROUPS[0]?.id ?? "faces");
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
      if (Array.isArray(parsedRecents)) {
        setRecentEmojis(parsedRecents.filter((entry): entry is string => typeof entry === "string"));
      }
    } catch (error) {
      console.error("[EmojiPickerButton.loadRecents]", error);
    }
  }, []);

  const activeGroup = useMemo(
    () => getEmojiGroupById(activeGroupId) ?? EMOJI_GROUPS[0],
    [activeGroupId]
  );

  const handleSelectEmoji = (emoji: string) => {
    onSelectEmoji(emoji);
    setIsOpen(false);

    const nextRecents = buildNextRecentEmojis(recentEmojis, emoji);
    setRecentEmojis(nextRecents);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, JSON.stringify(nextRecents));
      } catch (error) {
        console.error("[EmojiPickerButton.persistRecents]", error);
      }
    }
  };

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <Button
        type="button"
        size="sm"
        variant={isOpen ? "secondary" : "outline"}
        className="h-8 px-2.5 text-xs text-muted-foreground"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="Insert emoji"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <SmilePlus className="h-4 w-4" />
        Emoji
      </Button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border/70 bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="space-y-3">
            {recentEmojis.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  Recent
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {recentEmojis.map((emoji) => (
                    <button
                      key={`recent-${emoji}`}
                      type="button"
                      className="flex h-10 items-center justify-center rounded-lg border border-transparent bg-muted/30 text-lg transition hover:border-border/70 hover:bg-accent"
                      onClick={() => handleSelectEmoji(emoji)}
                      aria-label={`Insert ${emoji}`}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {EMOJI_GROUPS.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    activeGroupId === group.id
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
                <div className="grid grid-cols-6 gap-1.5">
                  {activeGroup.emojis.map((entry) => (
                    <button
                      key={entry.emoji}
                      type="button"
                      className="flex h-10 items-center justify-center rounded-lg border border-transparent bg-muted/30 text-lg transition hover:border-border/70 hover:bg-accent"
                      onClick={() => handleSelectEmoji(entry.emoji)}
                      aria-label={`Insert ${entry.name}`}
                      title={entry.name}
                    >
                      {entry.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
