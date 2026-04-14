"use client";

import { CalendarCheck2, CalendarX2 } from "lucide-react";
import { useEffect, useState } from "react";

import { DashboardStatCard } from "@/components/project-dashboard/dashboard-stat-card";
import {
  countUpcomingEventsThisWeek,
  formatUpcomingEventsLabel,
} from "@/lib/project-dashboard";

interface CalendarSummaryStatCardProps {
  isConnected: boolean;
  className?: string;
}

interface CalendarEventsPayload {
  connected: boolean;
  events?: Array<{
    start: string;
    end: string | null;
    id: string;
    summary: string;
    isAllDay: boolean;
    location: string | null;
    description: string | null;
    htmlLink: string | null;
    status: string;
  }>;
}

export function CalendarSummaryStatCard({
  isConnected,
  className,
}: CalendarSummaryStatCardProps) {
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(isConnected);

  useEffect(() => {
    if (!isConnected) {
      setUpcomingCount(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadEvents = async () => {
      setIsLoading(true);

      try {
        const response = await fetch("/api/calendar/events?range=current-week", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | CalendarEventsPayload
          | null;

        if (!response.ok || !payload?.connected || !Array.isArray(payload.events)) {
          setUpcomingCount(null);
          return;
        }

        setUpcomingCount(countUpcomingEventsThisWeek(payload.events));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setUpcomingCount(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadEvents();

    return () => controller.abort();
  }, [isConnected]);

  if (!isConnected) {
    return (
      <DashboardStatCard
        icon={CalendarX2}
        label="Calendar"
        value="Not connected"
        className={className}
        valueClassName="text-muted-foreground"
      />
    );
  }

  return (
    <DashboardStatCard
      icon={CalendarCheck2}
      label="Calendar"
      value={isLoading ? "Loading..." : formatUpcomingEventsLabel(upcomingCount)}
      className={className}
      valueClassName="text-foreground"
      labelTrailing={
          <span className="hidden h-4 shrink-0 items-center whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/8 px-1.5 text-[8px] font-semibold uppercase leading-none tracking-[0.04em] text-emerald-700 sm:inline-flex dark:text-emerald-300">
            Connected
          </span>
        }
      />
  );
}
