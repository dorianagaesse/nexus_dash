"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";
import { cn } from "@/lib/utils";

interface ContextCardOptionsMenuProps {
  cardId: string;
  deletingCardId?: string | null;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
  triggerClassName?: string;
}

export function ContextCardOptionsMenu({
  cardId,
  deletingCardId = null,
  onEditCard,
  onDeleteCard,
  onOpenChange,
  triggerClassName,
}: ContextCardOptionsMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const updateMenuOpen = (nextIsMenuOpen: boolean) => {
    setIsMenuOpen(nextIsMenuOpen);
    onOpenChange?.(nextIsMenuOpen);
  };

  const menuRef = useDismissibleMenu<HTMLDivElement>(isMenuOpen, () =>
    updateMenuOpen(false)
  );

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "rounded-md p-1 text-slate-800 hover:bg-slate-900/10",
          triggerClassName
        )}
        aria-label="Context card options"
        aria-expanded={isMenuOpen}
        onClick={() => updateMenuOpen(!isMenuOpen)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isMenuOpen ? (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              updateMenuOpen(false);
              onEditCard(cardId);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              updateMenuOpen(false);
              onDeleteCard(cardId);
            }}
            disabled={deletingCardId === cardId}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}
