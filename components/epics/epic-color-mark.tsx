import type { CSSProperties } from "react";
import { Flag } from "lucide-react";

import { getEpicColorFromName } from "@/lib/epic";

export function EpicColorMark({ name }: { name: string }) {
  const color = getEpicColorFromName(name);

  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--epic-soft)] text-[color:var(--epic-accent)] dark:bg-[color-mix(in_srgb,var(--epic-accent)_24%,transparent)] dark:text-[color:color-mix(in_srgb,var(--epic-accent)_55%,white)]"
      style={{
        "--epic-accent": color.accent,
        "--epic-soft": color.soft,
      } as CSSProperties}
    >
      <Flag className="size-4" />
    </span>
  );
}
