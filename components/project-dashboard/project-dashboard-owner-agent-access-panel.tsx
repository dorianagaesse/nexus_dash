"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpenText,
  Check,
  Copy,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import {
  AGENT_CREDENTIAL_PRESETS,
  AGENT_SCOPE_DEFINITIONS,
  DEFAULT_AGENT_CREDENTIAL_PRESET_ID,
  MAX_AGENT_CREDENTIAL_LABEL_LENGTH,
  resolveAgentCredentialPreset,
  type AgentScope,
} from "@/lib/agent-access";
import {
  AGENT_BASE_URL_PLACEHOLDER,
  buildAgentDocumentationUrls,
  buildAgentProjectEnvBlock,
} from "@/lib/agent-onboarding";
import { ProjectAgentCredentialList } from "./project-agent-credential-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAgentAuditAction,
  type ProjectAgentAccessActionError,
  type ProjectAgentAccessSummary,
  type ProjectAgentCredentialIssuedSecret,
  type ProjectAgentCredentialSummary,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

interface CreateProjectAgentCredentialInput {
  label: string;
  scopes: AgentScope[];
  expiresInDays: number | null;
}

interface ProjectDashboardOwnerAgentAccessPanelProps {
  projectId: string;
  accessSummary: ProjectAgentAccessSummary | null;
  isLoadingAccessSummary: boolean;
  accessLoadError: string | null;
  actionError: ProjectAgentAccessActionError | null;
  onRefreshAccess: () => void;
  isSavingCapabilities: boolean;
  onUpdateCapabilities: (allowed: boolean) => void;
  isCreatingCredential: boolean;
  mutatingCredentialId: string | null;
  latestIssuedSecret: (ProjectAgentCredentialIssuedSecret & {
    mode: "created" | "rotated";
  }) | null;
  onCreateCredential: (input: CreateProjectAgentCredentialInput) => void;
  onRotateCredential: (credential: ProjectAgentCredentialSummary) => void;
  onRevokeCredential: (credential: ProjectAgentCredentialSummary) => void;
  onDismissLatestSecret: () => void;
}

const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
] as const;

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

function buildUsageHint(accessTokenTtlSeconds: number): string {
  const ttlMinutes = Math.max(1, Math.round(accessTokenTtlSeconds / 60));
  return `Exchange this API key at /api/auth/agent/token to get a Bearer token valid for about ${ttlMinutes} minute${ttlMinutes === 1 ? "" : "s"}.`;
}

export function ProjectDashboardOwnerAgentAccessPanel({
  projectId,
  accessSummary,
  isLoadingAccessSummary,
  accessLoadError,
  actionError,
  onRefreshAccess,
  isSavingCapabilities,
  onUpdateCapabilities,
  isCreatingCredential,
  mutatingCredentialId,
  latestIssuedSecret,
  onCreateCredential,
  onRotateCredential,
  onRevokeCredential,
  onDismissLatestSecret,
}: ProjectDashboardOwnerAgentAccessPanelProps) {
  const [labelDraft, setLabelDraft] = useState("");
  const [expiryDraft, setExpiryDraft] = useState<(typeof EXPIRY_OPTIONS)[number]["value"]>("");
  const [selectedScopes, setSelectedScopes] = useState<AgentScope[]>(() => {
    const defaultPreset = resolveAgentCredentialPreset(
      DEFAULT_AGENT_CREDENTIAL_PRESET_ID
    );
    return defaultPreset ? [...defaultPreset.scopes] : [];
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);
  const [hasCopiedQuickstart, setHasCopiedQuickstart] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const issuedSecretInputRef = useRef<HTMLInputElement>(null);
  const [runtimeAppOrigin, setRuntimeAppOrigin] = useState(AGENT_BASE_URL_PLACEHOLDER);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setRuntimeAppOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!latestIssuedSecret) {
      return;
    }

    setHasCopiedSecret(false);
    setHasCopiedQuickstart(false);
    setCopyError(null);
    issuedSecretInputRef.current?.focus();
    if (latestIssuedSecret.mode === "created") {
      setLabelDraft("");
      setExpiryDraft("");
      const defaultPreset = resolveAgentCredentialPreset(
        DEFAULT_AGENT_CREDENTIAL_PRESET_ID
      );
      setSelectedScopes(defaultPreset ? [...defaultPreset.scopes] : []);
      setFormError(null);
    }
  }, [latestIssuedSecret]);

  useEffect(() => {
    if (!hasCopiedSecret && !hasCopiedQuickstart) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHasCopiedSecret(false);
      setHasCopiedQuickstart(false);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [hasCopiedQuickstart, hasCopiedSecret]);

  const docsLinks = useMemo(
    () => buildAgentDocumentationUrls(runtimeAppOrigin),
    [runtimeAppOrigin]
  );
  const quickstartEnvBlock = useMemo(
    () =>
      buildAgentProjectEnvBlock({
        appOrigin: runtimeAppOrigin,
        projectId,
        apiKey: latestIssuedSecret?.apiKey ?? null,
      }),
    [latestIssuedSecret?.apiKey, projectId, runtimeAppOrigin]
  );

  const handleToggleScope = (scope: AgentScope) => {
    setSelectedScopes((currentScopes) =>
      currentScopes.includes(scope)
        ? currentScopes.filter((currentScope) => currentScope !== scope)
        : [...currentScopes, scope].sort(
            (left, right) =>
              AGENT_SCOPE_DEFINITIONS.findIndex((entry) => entry.scope === left) -
              AGENT_SCOPE_DEFINITIONS.findIndex((entry) => entry.scope === right)
          )
    );
    setFormError(null);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = resolveAgentCredentialPreset(presetId);
    if (!preset) {
      return;
    }

    setSelectedScopes([...preset.scopes]);
    setFormError(null);
  };

  const handleCreateCredential = () => {
    const label = labelDraft.trim();
    if (label.length < 2 || label.length > MAX_AGENT_CREDENTIAL_LABEL_LENGTH) {
      setFormError("Credential label must be between 2 and 80 characters.");
      return;
    }

    if (selectedScopes.length === 0) {
      setFormError("Select at least one scope before creating a credential.");
      return;
    }

    const expiresInDays =
      expiryDraft.length > 0 ? Number.parseInt(expiryDraft, 10) : null;
    setFormError(null);
    onCreateCredential({
      label,
      scopes: selectedScopes,
      expiresInDays,
    });
  };

  const handleCopySecret = async () => {
    if (!latestIssuedSecret) {
      return;
    }

    setCopyError(null);
    try {
      await navigator.clipboard.writeText(latestIssuedSecret.apiKey);
      setHasCopiedSecret(true);
    } catch {
      setHasCopiedSecret(false);
      setCopyError("Could not copy the API key. Select the key and copy it manually.");
    }
  };

  const handleCopyQuickstart = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(quickstartEnvBlock);
      setHasCopiedQuickstart(true);
    } catch {
      setHasCopiedQuickstart(false);
      setCopyError("Could not copy the env block. Select the block and copy it manually.");
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      {copyError ? <p role="alert" className="text-sm text-destructive xl:col-span-2">{copyError}</p> : null}
      {accessLoadError ? (
        <div role="alert" aria-label="Credential loading error" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive xl:col-span-2">
          <p className="min-w-0 break-words">{accessLoadError}</p>
          <Button type="button" variant="outline" size="sm" disabled={isLoadingAccessSummary} onClick={onRefreshAccess}>
            Retry loading credentials
          </Button>
        </div>
      ) : null}
      {latestIssuedSecret ? (
        <section className="min-w-0 space-y-4 xl:col-span-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-200" />
                <h3 className="text-base font-semibold">
                  {latestIssuedSecret.mode === "created"
                    ? "Copy the new API key now"
                    : "Copy the rotated API key now"}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                This value is shown once for <span className="font-medium">{latestIssuedSecret.credential.label}</span>.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismissLatestSecret}
            >
              Hide key
            </Button>
          </div>

          <div className="flex max-w-full items-center gap-2">
            <input
              ref={issuedSecretInputRef}
              readOnly
              value={latestIssuedSecret.apiKey}
              aria-label={`API key for ${latestIssuedSecret.credential.label}`}
              className="h-10 min-w-0 flex-1 rounded-md border border-amber-500/20 bg-background px-3 text-xs text-muted-foreground outline-none sm:text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Copy API key for ${latestIssuedSecret.credential.label}`}
              className="h-10 w-10 shrink-0"
              onClick={() => void handleCopySecret()}
            >
              {hasCopiedSecret ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          {hasCopiedSecret ? <p role="status" className="text-sm">API key copied.</p> : null}

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{buildUsageHint(latestIssuedSecret.accessTokenTtlSeconds)}</p>
            <p>
              Send <code>Authorization: ApiKey &lt;key&gt;</code> to{" "}
              <code>/api/auth/agent/token</code>, then use the returned bearer token on project,
              roadmap, task, and context endpoints allowed by this credential&apos;s scopes.
            </p>
          </div>
        </section>
      ) : null}

      <section aria-label="Agent access" className="min-w-0 space-y-5 rounded-2xl border border-border/60 bg-background/60 p-4 sm:p-5 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold">Credentials</h3>
            <p className="text-sm text-muted-foreground">Find an agent, review its capabilities, or manage its API key.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => labelInputRef.current?.focus()}>
            <KeyRound className="h-4 w-4" /> New credential
          </Button>
        </div>
        {actionError?.action === "rotate" ? (
          <p role="alert" aria-label="Credential rotation error" className="text-sm text-destructive">{actionError.message}</p>
        ) : null}
        {isLoadingAccessSummary ? <p role="status" className="text-sm text-muted-foreground">{accessSummary ? "Refreshing credentials..." : "Loading credentials..."}</p> : null}
        {!isLoadingAccessSummary && accessSummary?.credentials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No agent credentials exist for this project yet. Create a credential to give a trusted agent access.
          </div>
        ) : null}
        {accessSummary && accessSummary.credentials.length > 0 ? (
          <ProjectAgentCredentialList
            credentials={accessSummary.credentials}
            mutatingCredentialId={mutatingCredentialId}
            onRotateCredential={onRotateCredential}
            onRevokeCredential={onRevokeCredential}
          />
        ) : null}
      </section>
      <div className="min-w-0 space-y-6">
        <section className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-5">
          <h3 className="text-base font-semibold">Agent capabilities</h3>
          <p className="text-sm text-muted-foreground">Project-wide settings. Changes save immediately.</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={accessSummary?.agentCanMoveTasksToDone ?? false}
              disabled={!accessSummary || isLoadingAccessSummary || isSavingCapabilities}
              onChange={(event) => onUpdateCapabilities(event.target.checked)}
              aria-describedby="agent-done-move-description"
              className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">Allow agents to move tasks to Done</span>
              <span id="agent-done-move-description" className="block text-sm text-muted-foreground">
                Applies to every agent credential in this project. Off by default so a person reviews completed work. Human moves are unaffected.
              </span>
            </span>
          </label>
          {isSavingCapabilities ? <p role="status" className="text-sm text-muted-foreground">Saving capabilities...</p> : null}
          {actionError?.action === "capabilities" ? (
            <p role="alert" aria-label="Agent capabilities error" className="text-sm text-destructive">{actionError.message}</p>
          ) : null}
        </section>

        <section aria-labelledby="create-agent-credential" className="min-w-0 space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <h3 id="create-agent-credential" className="text-base font-semibold">Create an agent credential</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Create project-scoped API credentials for trusted agents. Raw keys are shown once,
                exchanged for short-lived bearer tokens, and fully auditable.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {accessSummary
                ? `${Math.max(1, Math.round(accessSummary.accessTokenTtlSeconds / 60))} min token TTL`
                : "Short-lived tokens"}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid min-w-0 gap-2">
              <label htmlFor="project-agent-label" className="text-sm font-medium">
                Credential label
              </label>
              <input
                ref={labelInputRef}
                id="project-agent-label"
                value={labelDraft}
                onChange={(event) => {
                  setLabelDraft(event.target.value);
                  setFormError(null);
                }}
                placeholder="Release bot"
                maxLength={MAX_AGENT_CREDENTIAL_LABEL_LENGTH}
                className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid min-w-0 gap-2">
              <label htmlFor="project-agent-expiry" className="text-sm font-medium">
                Credential expiry
              </label>
              <select
                id="project-agent-expiry"
                value={expiryDraft}
                onChange={(event) =>
                  setExpiryDraft(event.target.value as (typeof expiryDraft))
                }
                className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value || "never"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Scopes</p>
              <p className="text-xs text-muted-foreground">
                Start from a preset, then adjust with the checkboxes. Most agents only
                need read + write without delete; attention-only agents can start with
                Attention read only.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2" role="group" aria-label="Scope presets">
              {AGENT_CREDENTIAL_PRESETS.map((preset) => {
                const isActive =
                  selectedScopes.length === preset.scopes.length &&
                  preset.scopes.every((scope) => selectedScopes.includes(scope));

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    aria-pressed={isActive}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {preset.label}
                      {preset.recommended ? (
                        <Badge
                          variant="outline"
                          className="rounded-full px-2 py-0 text-[10px]"
                        >
                          Recommended
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {AGENT_SCOPE_DEFINITIONS.map((definition) => {
                const isChecked = selectedScopes.includes(definition.scope);

                return (
                  <label
                    key={definition.scope}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-3"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleScope(definition.scope)}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{definition.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {definition.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {formError ? (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          ) : null}
          {actionError?.action === "create" ? (
            <p role="alert" aria-label="Credential creation error" className="text-sm text-destructive">{actionError.message}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              onClick={handleCreateCredential}
              disabled={isCreatingCredential || !accessSummary || isLoadingAccessSummary}
            >
              <KeyRound className="h-4 w-4" />
              {isCreatingCredential ? "Creating..." : "Create credential"}
            </Button>
          </div>
        </section>
      </div>

      <div className="min-w-0 space-y-6">
        <section className="min-w-0 space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpenText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-base font-semibold">Project quickstart</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Use this bootstrap block in the external agent runtime. If you lose the raw API key,
              rotate the credential here and replace the env value.
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-sm">
            Project id: <code className="break-all">{projectId}</code>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={docsLinks.docsUrl}>Hosted docs</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={docsLinks.openApiUrl}>OpenAPI JSON</a>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyQuickstart()}>
              {hasCopiedQuickstart ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {hasCopiedQuickstart ? "Copied env" : "Copy env block"}
            </Button>
          </div>

          <pre className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-border/70 bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-50">
            <code>{quickstartEnvBlock}</code>
          </pre>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Exchange <code>NEXUSDASH_API_KEY</code> at <code>/api/auth/agent/token</code>,
              then send the returned bearer token to the scoped project routes.
            </p>
            <p>
              This project ships agent-ready support for project read, roadmap routes, task
              routes, context-card routes, and documented attachment upload/download flows.
            </p>
          </div>
        </section>

        <section className="min-w-0 space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Recent audit trail</h3>
            <p className="text-sm text-muted-foreground">
              Creation, rotation, revocation, token exchange, and request usage are recorded
              here.
            </p>
          </div>

          {!isLoadingAccessSummary &&
          accessSummary &&
          accessSummary.recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : null}

          {accessSummary?.recentEvents.length ? (
            <div className="space-y-3">
              {accessSummary.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="space-y-2 rounded-xl border border-border/60 bg-card p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{formatAgentAuditAction(event.action)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(event.createdAt)}
                    </p>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      Credential:{" "}
                      <span className="font-medium text-foreground">
                        {event.credentialLabel ?? "Unknown credential"}
                      </span>
                    </p>
                    {event.httpMethod && event.path ? (
                      <p>
                        Request:{" "}
                        <code className="break-all">
                          {event.httpMethod} {event.path}
                        </code>
                      </p>
                    ) : null}
                    {event.ipAddress ? <p>IP: {event.ipAddress}</p> : null}
                    {event.requestId ? <p>Request id: {event.requestId}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
