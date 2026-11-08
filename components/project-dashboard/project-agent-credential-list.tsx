"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, Bot, Search, SlidersHorizontal } from "lucide-react";
import {
  AGENT_SCOPE_DEFINITIONS,
  type AgentCredentialStatus,
  type AgentScope,
} from "@/lib/agent-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAgentCredentialStatus,
  type ProjectAgentCredentialSummary,
  type ProjectAgentAccessActionError,
} from "./project-dashboard-owner-actions.shared";
import {
  describeAgentAccess,
  describeAgentResources,
  formatAgentDate,
} from "./project-agent-access-presentation";

interface ProjectAgentCredentialListProps {
  credentials: ProjectAgentCredentialSummary[];
  mutatingCredentialId: string | null;
  onManageCredential: (
    credential: ProjectAgentCredentialSummary,
    trigger: HTMLButtonElement
  ) => void;
  onUpdateCapabilities: (
    credential: ProjectAgentCredentialSummary,
    allowed: boolean
  ) => void;
  actionError: ProjectAgentAccessActionError | null;
}

const STATUS_TONES = {
  active:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  revoked: "border-border bg-muted text-muted-foreground",
};

export function AgentTaskCompletionSwitch({
  credential,
  disabled,
  onChange,
}: {
  credential: ProjectAgentCredentialSummary;
  disabled: boolean;
  onChange: (allowed: boolean) => void;
}) {
  const canEditTasks = credential.scopes.includes("task:write");
  const isActive = credential.status === "active";
  const canComplete = isActive && canEditTasks && credential.canMoveTasksToDone;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={canComplete}
      aria-label={`Allow ${credential.label} to move tasks to Done`}
      disabled={disabled || !isActive || !canEditTasks}
      title={
        !isActive
          ? "Inactive credentials cannot complete tasks"
          : !canEditTasks
            ? "Task Write access is required to complete tasks"
            : undefined
      }
      onClick={() => onChange(!credential.canMoveTasksToDone)}
      className="group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full border border-transparent transition-colors group-disabled:opacity-40 ${canComplete ? "bg-primary" : "bg-muted-foreground/25"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none ${canComplete ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
      <span className="text-xs text-muted-foreground">
        {!isActive
          ? "Inactive"
          : !canEditTasks
            ? "No task editing"
            : credential.canMoveTasksToDone
              ? "Allowed"
              : "Review required"}
      </span>
    </button>
  );
}

export function ProjectAgentCredentialList({
  credentials,
  mutatingCredentialId,
  onManageCredential,
  onUpdateCapabilities,
  actionError,
}: ProjectAgentCredentialListProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AgentCredentialStatus | "all">("all");
  const [capability, setCapability] = useState<
    AgentScope | "all" | "complete-tasks"
  >("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterId = useId();
  const [announcement, setAnnouncement] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filterCount = Number(status !== "all") + Number(capability !== "all");
  const hasFilters = normalizedQuery.length > 0 || filterCount > 0;
  const matches = credentials.filter(
    (credential) =>
      credential.label.toLocaleLowerCase().includes(normalizedQuery) &&
      (status === "all" || credential.status === status) &&
      (capability === "all" ||
        (capability === "complete-tasks"
          ? credential.canMoveTasksToDone &&
            credential.status === "active" &&
            credential.scopes.includes("task:write")
          : credential.scopes.includes(capability)))
  );
  const resultCount = `Showing ${matches.length} of ${credentials.length} credential${credentials.length === 1 ? "" : "s"}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(resultCount), 400);
    return () => window.clearTimeout(timer);
  }, [query, status, capability, resultCount]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor={`${filterId}-search`} className="sr-only">
            Search credentials
          </label>
          <input
            id={`${filterId}-search`}
            type="search"
            value={query}
            aria-describedby={`${filterId}-count`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an agent by name…"
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant={filterCount ? "secondary" : "outline"}
          aria-expanded={filtersOpen}
          aria-controls={`${filterId}-filters`}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          {filterCount ? ` (${filterCount})` : ""}
        </Button>
      </div>
      <div
        id={`${filterId}-filters`}
        hidden={!filtersOpen}
        className={`${filtersOpen ? "grid" : "hidden"} min-w-0 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-2`}
      >
        <div className="min-w-0 space-y-1.5">
          <label htmlFor={`${filterId}-status`} className="text-xs font-medium">
            Status
          </label>
          <select
            id={`${filterId}-status`}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as AgentCredentialStatus | "all")
            }
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor={`${filterId}-capability`}
            className="text-xs font-medium"
          >
            Capability
          </label>
          <select
            id={`${filterId}-capability`}
            value={capability}
            onChange={(event) =>
              setCapability(event.target.value as typeof capability)
            }
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All capabilities</option>
            <option value="complete-tasks">Complete tasks</option>
            {AGENT_SCOPE_DEFINITIONS.filter(({ scope }) => !scope.startsWith("schedule:")).map(({ scope, label }) => (
              <option key={scope} value={scope}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${filterId}-count`} className="text-xs text-muted-foreground">
          {resultCount}
        </p>
        <p role="status" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setCapability("all");
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Search
            className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium">No matching agents</p>
          <p className="mt-1 px-4 text-xs text-muted-foreground">
            Try a different name or clear your filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/60">
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_140px_80px] gap-4 border-b border-border/70 bg-muted/35 px-4 py-3 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>Agent</span>
            <span>Access</span>
            <span>Task completion</span>
            <span className="text-right">Manage</span>
          </div>
          <ul
            aria-label="Agent credentials"
            className="divide-y divide-border/60"
          >
            {matches.map((credential) => (
              <li
                key={credential.id}
                aria-label={credential.label}
                className="grid min-w-0 items-center gap-4 p-4 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_140px_80px]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                    <Bot className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <h4 className="[overflow-wrap:anywhere] text-sm font-semibold leading-snug">
                      {credential.label}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        variant="outline"
                        className={`px-2 py-0 text-[11px] font-medium ${STATUS_TONES[credential.status]}`}
                      >
                        {formatAgentCredentialStatus(credential.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {credential.lastUsedAt
                          ? `Used ${formatAgentDate(credential.lastUsedAt)}`
                          : "Not used yet"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 space-y-1 pl-[52px] md:pl-0">
                  <p className="text-sm font-medium">
                    {describeAgentAccess(credential.scopes)}
                  </p>
                  <p className="break-words text-xs leading-relaxed text-muted-foreground">
                    {describeAgentResources(credential.scopes).map((resource) => resource.name).join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {credential.expiresAt
                      ? `${credential.status === "expired" ? "Expired" : "Expires"} ${formatAgentDate(credential.expiresAt)}`
                      : "No expiry"}
                  </p>
                </div>
                <div className="min-w-0 pl-[52px] md:pl-0">
                  <span className="mb-1.5 block text-xs text-muted-foreground md:hidden">
                    Task completion
                  </span>
                  <AgentTaskCompletionSwitch
                    credential={credential}
                    disabled={mutatingCredentialId !== null}
                    onChange={(allowed) =>
                      onUpdateCapabilities(credential, allowed)
                    }
                  />
                  {mutatingCredentialId === credential.id ? (
                    <p
                      role="status"
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      Saving…
                    </p>
                  ) : null}
                  {actionError?.action === "capabilities" &&
                  actionError.credentialId === credential.id ? (
                    <p
                      role="alert"
                      aria-label="Agent capabilities error"
                      className="mt-2 text-xs text-destructive"
                    >
                      {actionError.message}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-[52px] justify-self-start md:ml-0 md:justify-self-end"
                  onClick={(event) =>
                    onManageCredential(credential, event.currentTarget)
                  }
                  aria-label={`Manage ${credential.label}`}
                >
                  Manage <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
