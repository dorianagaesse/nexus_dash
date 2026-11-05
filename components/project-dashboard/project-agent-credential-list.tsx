"use client";

import { useEffect, useId, useState } from "react";
import { RefreshCw, ShieldX } from "lucide-react";

import { AGENT_SCOPE_DEFINITIONS, type AgentCredentialStatus, type AgentScope } from "@/lib/agent-access";
import { AgentCredentialDescriptiveLabels } from "@/components/agent-credential-descriptive-labels";
import { AgentCredentialLabelEditor } from "./agent-credential-label-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAgentCredentialStatus,
  type ProjectAgentCredentialSummary,
} from "./project-dashboard-owner-actions.shared";

interface ProjectAgentCredentialListProps {
  credentials: ProjectAgentCredentialSummary[];
  mutatingCredentialId: string | null;
  onUpdateCredentialLabels?: (credential: ProjectAgentCredentialSummary, labels: string[]) => Promise<boolean>;
  onRotateCredential: (credential: ProjectAgentCredentialSummary) => void;
  onRevokeCredential: (credential: ProjectAgentCredentialSummary) => void;
}

const STATUS_TONES = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  expired: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  revoked: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function ProjectAgentCredentialList({
  credentials,
  mutatingCredentialId,
  onUpdateCredentialLabels,
  onRotateCredential,
  onRevokeCredential,
}: ProjectAgentCredentialListProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AgentCredentialStatus | "all">("all");
  const [capability, setCapability] = useState<AgentScope | "all">("all");
  const filterId = useId();
  const resultCountId = `${filterId}-count`;
  const [resultAnnouncement, setResultAnnouncement] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const hasFilters = normalizedQuery.length > 0 || status !== "all" || capability !== "all";
  const matches = credentials.filter((credential) =>
    (credential.label.toLocaleLowerCase().includes(normalizedQuery) ||
      credential.descriptiveLabels?.some((label) => label.toLocaleLowerCase().includes(normalizedQuery))) &&
    (status === "all" || credential.status === status) &&
    (capability === "all" || credential.scopes.includes(capability))
  );
  const resultCount = `Showing ${matches.length} of ${credentials.length} credential${credentials.length === 1 ? "" : "s"}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => setResultAnnouncement(resultCount), 400);
    return () => window.clearTimeout(timeout);
  }, [query, status, capability, resultCount]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,240px)]">
        <div className="grid min-w-0 gap-1.5 text-sm font-medium">
          <label htmlFor={`${filterId}-search`}>Search credentials</label>
          <input
            id={`${filterId}-search`}
            aria-describedby={resultCountId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or label"
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="grid min-w-0 gap-1.5 text-sm font-medium">
          <label htmlFor={`${filterId}-status`}>Status</label>
          <select
            id={`${filterId}-status`}
            aria-describedby={resultCountId}
            value={status}
            onChange={(event) => setStatus(event.target.value as AgentCredentialStatus | "all")}
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5 text-sm font-medium">
          <label htmlFor={`${filterId}-capability`}>Capability</label>
          <select
            id={`${filterId}-capability`}
            aria-describedby={resultCountId}
            value={capability}
            onChange={(event) => setCapability(event.target.value as AgentScope | "all")}
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All capabilities</option>
            {AGENT_SCOPE_DEFINITIONS.map(({ scope, label }) => (
              <option key={scope} value={scope}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={resultCountId} className="text-sm text-muted-foreground">{resultCount}</p>
        <p role="status" aria-atomic="true" className="sr-only">{resultAnnouncement}</p>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            setQuery("");
            setStatus("all");
            setCapability("all");
          }}>
            Clear filters
          </Button>
        ) : null}
      </div>
      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          No credentials match your search and filters. Try another search or clear the filters.
        </div>
      ) : (
        <ul aria-label="Agent credentials" className="min-w-0 divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
          {matches.map((credential) => (
            <li key={credential.id} aria-label={credential.label} className="min-w-0 space-y-3 p-4">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="min-w-0 w-full flex-1 space-y-2 sm:w-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="min-w-0 break-all text-sm font-semibold">{credential.label}</h4>
                    <AgentCredentialDescriptiveLabels labels={credential.descriptiveLabels} />
                    <Badge variant="outline" className={STATUS_TONES[credential.status]}>
                      {formatAgentCredentialStatus(credential.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5" aria-label="Capabilities">
                    {credential.scopes.map((scope) => {
                      const definition = AGENT_SCOPE_DEFINITIONS.find((entry) => entry.scope === scope);
                      return (
                        <Badge key={scope} variant="secondary" title={`${scope}: ${definition?.description ?? ""}`}>
                          {definition?.label ?? scope}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Rotate key for ${credential.label}`}
                    title={credential.status === "active" ? "Replace the API key" : "Only active credentials can be rotated"}
                    disabled={credential.status !== "active" || mutatingCredentialId !== null}
                    onClick={() => onRotateCredential(credential)}
                  >
                    <RefreshCw className="h-4 w-4" /> Rotate key
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke ${credential.label}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={credential.status === "revoked" || mutatingCredentialId !== null}
                    onClick={() => onRevokeCredential(credential)}
                  >
                    <ShieldX className="h-4 w-4" /> Revoke
                  </Button>
                </div>
              </div>
              {onUpdateCredentialLabels ? (
                <AgentCredentialLabelEditor
                  credentialId={credential.id}
                  name={credential.label}
                  labels={credential.descriptiveLabels}
                  disabled={mutatingCredentialId !== null}
                  onSave={(labels) => onUpdateCredentialLabels(credential, labels)}
                />
              ) : null}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <p>Last used: {formatTimestamp(credential.lastUsedAt)}</p>
                <p>Expires: {formatTimestamp(credential.expiresAt)}</p>
              </div>
              {mutatingCredentialId === credential.id ? <p role="status" className="text-sm text-muted-foreground">Updating credential...</p> : null}
              <details className="min-w-0 text-xs text-muted-foreground">
                <summary className="w-fit cursor-pointer rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Credential details
                </summary>
                <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Public id", credential.publicId],
                    ["Created", formatTimestamp(credential.createdAt)],
                    ["Last exchanged", formatTimestamp(credential.lastExchangedAt)],
                    ["Last rotated", formatTimestamp(credential.lastRotatedAt)],
                    ["Revoked", formatTimestamp(credential.revokedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt>{label}</dt>
                      <dd className="mt-1 break-all text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
