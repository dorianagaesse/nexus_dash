"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SectionHelpAffordanceProps {
  title: string;
  description?: string;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

interface PopoverLayout {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 8;
const MIN_PANEL_HEIGHT = 160;
const MAX_PANEL_HEIGHT = 520;
const DESKTOP_PANEL_WIDTH = 400;
const MOBILE_PANEL_WIDTH = 340;

export function SectionHelpAffordance({
  title,
  description,
  children,
  ariaLabel = "Section help",
  className,
}: SectionHelpAffordanceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<PopoverLayout | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setLayout(null);
      return;
    }

    const updateLayout = () => {
      if (!buttonRef.current || typeof window === "undefined") {
        return;
      }

      const triggerRect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const preferredWidth =
        viewportWidth < 640 ? MOBILE_PANEL_WIDTH : DESKTOP_PANEL_WIDTH;
      const width = Math.min(preferredWidth, viewportWidth - VIEWPORT_MARGIN * 2);

      // Align right edge of popover with trigger if possible, clamped to viewport
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

      setLayout({
        left,
        top,
        width,
        maxHeight,
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (popoverRef.current && popoverRef.current.contains(target)) ||
        (buttonRef.current && buttonRef.current.contains(target))
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

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "h-8 w-8 shrink-0 rounded-full text-muted-foreground transition hover:bg-muted/60 hover:text-foreground",
          isOpen && "bg-muted text-foreground",
          className
        )}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {isOpen && layout && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              data-overlay-popover="true"
              data-section-help-popover="true"
              role="dialog"
              aria-modal="false"
              aria-label={ariaLabel || title}
              className="pointer-events-auto fixed z-[140] flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-2xl backdrop-blur-md"
              style={{
                left: layout.left,
                top: layout.top,
                width: layout.width,
                maxHeight: layout.maxHeight,
              }}
            >
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div className="min-w-0 pr-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {title}
                  </p>
                  {description ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close help"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="overflow-y-auto p-4 text-xs leading-relaxed text-muted-foreground [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin] sm:text-sm">
                {children}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
