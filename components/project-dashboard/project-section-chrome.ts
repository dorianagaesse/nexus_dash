import { cn } from "@/lib/utils";

export const PROJECT_SECTION_CHROME_CLASS =
  "rounded-2xl border border-border/70 bg-card/55 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.6)] backdrop-blur-sm";

export const PROJECT_SECTION_CARD_CLASS = cn(
  "overflow-hidden",
  PROJECT_SECTION_CHROME_CLASS
);

export const PROJECT_SECTION_HEADER_CLASS =
  "border-b border-border/50 bg-background/30";

export const PROJECT_SECTION_CONTENT_CLASS = "px-5 py-5";
