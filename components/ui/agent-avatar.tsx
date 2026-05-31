import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

interface AgentAvatarProps {
  displayName: string;
  className?: string;
  decorative?: boolean;
}

export function AgentAvatar({
  displayName,
  className,
  decorative = false,
}: AgentAvatarProps) {
  return (
    <span
      aria-hidden={decorative}
      aria-label={decorative ? undefined : `${displayName} avatar`}
      data-agent-avatar="true"
      role={decorative ? undefined : "img"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted text-muted-foreground",
        className
      )}
    >
      <Bot aria-hidden="true" className="h-2/3 w-2/3" strokeWidth={2.2} />
    </span>
  );
}
