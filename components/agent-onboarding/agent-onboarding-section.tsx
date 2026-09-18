"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AgentOnboardingSectionProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  contentClassName?: string;
  children: ReactNode;
}

export function AgentOnboardingSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  contentClassName,
  children,
}: AgentOnboardingSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Card className="min-w-0 border-border/60 bg-background/70">
      <CardHeader className="space-y-3">
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
              {title}
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </button>
      </CardHeader>
      <CardContent id={contentId} className={cn(isOpen ? contentClassName : "hidden")}>
        {children}
      </CardContent>
    </Card>
  );
}
