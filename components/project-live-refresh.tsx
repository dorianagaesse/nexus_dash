"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const DEFAULT_POLL_INTERVAL_MS = 5000;

interface ProjectLiveRefreshProps {
  projectId: string;
  initialVersion: string;
  pollIntervalMs?: number;
}

interface ProjectActivityResponse {
  projectId: string;
  version: string;
  serverTime: string;
}

function parseVersion(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hasRefreshLock(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  if (document.querySelector("[data-project-live-refresh-lock='true']")) {
    return true;
  }

  if (document.querySelector("[role='dialog']")) {
    return true;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  const tagName = activeElement.tagName.toLowerCase();
  return (
    activeElement.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function ProjectLiveRefresh({
  projectId,
  initialVersion,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: ProjectLiveRefreshProps) {
  const router = useRouter();
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const knownVersionRef = useRef(initialVersion);
  const pendingVersionRef = useRef<string | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    knownVersionRef.current = initialVersion;
    pendingVersionRef.current = null;
    setPendingVersion(null);
  }, [initialVersion]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const refreshDashboard = useCallback(
    (nextVersion: string) => {
      knownVersionRef.current = nextVersion;
      pendingVersionRef.current = null;
      setPendingVersion(null);
      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function pollActivity() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/activity`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ProjectActivityResponse;
        if (payload.projectId !== projectId || !payload.version) {
          return;
        }

        const nextVersionMs = parseVersion(payload.version);
        const knownVersionMs = parseVersion(knownVersionRef.current);
        if (nextVersionMs <= knownVersionMs) {
          return;
        }

        if (hasRefreshLock() || isRefreshingRef.current) {
          pendingVersionRef.current = payload.version;
          setPendingVersion(payload.version);
          return;
        }

        refreshDashboard(payload.version);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          return;
        }
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(pollActivity, pollIntervalMs);
        }
      }
    }

    timeoutId = setTimeout(pollActivity, pollIntervalMs);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      controller?.abort();
    };
  }, [pollIntervalMs, projectId, refreshDashboard]);

  useEffect(() => {
    function refreshWhenVisible() {
      const pending = pendingVersionRef.current;
      if (!pending || document.hidden || hasRefreshLock()) {
        return;
      }

      refreshDashboard(pending);
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refreshDashboard]);

  if (!pendingVersion) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg sm:left-auto sm:right-4 sm:w-auto sm:translate-x-0"
    >
      <span>Project updates are ready.</span>
      <Button
        type="button"
        size="sm"
        onClick={() => refreshDashboard(pendingVersion)}
        disabled={isRefreshing}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}

export const projectLiveRefreshInternals = {
  hasRefreshLock,
  parseVersion,
};
