"use client";
import type { AgentScope } from "@/lib/agent-access";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpenText,
  Bot,
  CheckCheck,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  AGENT_BASE_URL_PLACEHOLDER,
  buildAgentDocumentationUrls,
  buildAgentProjectEnvBlock,
} from "@/lib/agent-onboarding";
import { Button } from "@/components/ui/button";
import { SLIM_SCROLLBAR_CLASSES } from "@/components/ui/scrollbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectAgentCredentialList } from "./project-agent-credential-list";
import {
  ProjectAgentCredentialForm,
  type CreateProjectAgentCredentialInput,
} from "./project-agent-credential-form";
import {
  formatAgentAuditAction,
  type ProjectAgentAccessActionError,
  type ProjectAgentAccessSummary,
  type ProjectAgentCredentialIssuedSecret,
  type ProjectAgentCredentialSummary,
} from "./project-dashboard-owner-actions.shared";

import { DialogCloseButton } from "./project-agent-dialog-close";
import { ProjectAgentCredentialDetailsDialog } from "./project-agent-credential-details-dialog";
import { ProjectAgentIssuedKeyDialog } from "./project-agent-issued-key-dialog";
import { ProjectAgentSetupGuideDialog } from "./project-agent-setup-guide-dialog";

interface ProjectDashboardOwnerAgentAccessPanelProps {
  projectId: string;
  accessSummary: ProjectAgentAccessSummary | null;
  isLoadingAccessSummary: boolean;
  accessLoadError: string | null;
  actionError: ProjectAgentAccessActionError | null;
  onClearActionError: () => void;
  onRefreshAccess: () => void;
  onUpdateCapabilities: (
    credential: ProjectAgentCredentialSummary,
    allowed: boolean
  ) => void;
  onUpdateScopes: (credential: ProjectAgentCredentialSummary, scopes: AgentScope[]) => Promise<boolean>;
  isCreatingCredential: boolean;
  mutatingCredentialId: string | null;
  latestIssuedSecret:
    | (ProjectAgentCredentialIssuedSecret & { mode: "created" | "rotated" })
    | null;
  onCreateCredential: (input: CreateProjectAgentCredentialInput) => void;
  onUpdateCredentialLabels?: (credential: ProjectAgentCredentialSummary, labels: string[]) => Promise<boolean>;
  onRotateCredential: (credential: ProjectAgentCredentialSummary) => void;
  onRevokeCredential: (credential: ProjectAgentCredentialSummary) => void;
  onDismissLatestSecret: () => void;
}

export function ProjectDashboardOwnerAgentAccessPanel({
  projectId,
  accessSummary,
  isLoadingAccessSummary,
  accessLoadError,
  actionError,
  onClearActionError,
  onRefreshAccess,
  onUpdateCapabilities,
  onUpdateScopes,
  isCreatingCredential,
  mutatingCredentialId,
  latestIssuedSecret,
  onCreateCredential,
  onUpdateCredentialLabels,
  onRotateCredential,
  onRevokeCredential,
  onDismissLatestSecret,
}: ProjectDashboardOwnerAgentAccessPanelProps) {
  const [view, setView] = useState<"credentials" | "activity">("credentials");
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [managedId, setManagedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "env" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [origin, setOrigin] = useState(AGENT_BASE_URL_PLACEHOLDER);
  const creationInputRef = useRef<HTMLInputElement>(null);
  const setupTriggerRef = useRef<HTMLButtonElement>(null);
  const manageTriggerRef = useRef<HTMLButtonElement>(null);
  const newCredentialRef = useRef<HTMLButtonElement>(null);
  const credentials = accessSummary?.credentials ?? [];
  const managed =
    credentials.find((credential) => credential.id === managedId) ?? null;
  const active = credentials.filter(
    (credential) => credential.status === "active"
  );
  const canComplete = active.filter(
    (credential) =>
      credential.canMoveTasksToDone && credential.scopes.includes("task:write")
  );
  const busy = mutatingCredentialId !== null;
  const docs = useMemo(() => buildAgentDocumentationUrls(origin), [origin]);
  const envBlock = useMemo(
    () =>
      buildAgentProjectEnvBlock({
        appOrigin: origin,
        projectId,
        apiKey: latestIssuedSecret?.apiKey ?? null,
      }),
    [origin, projectId, latestIssuedSecret?.apiKey]
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!latestIssuedSecret) return;
    setCreateOpen(false);
    setManagedId(null);
    setCopied(null);
    setCopyError(null);
  }, [latestIssuedSecret]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const openCreation = () => {
    onClearActionError();
    setCreateOpen(true);
  };
  const copy = async (kind: "key" | "env") => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(
        kind === "key" ? latestIssuedSecret!.apiKey : envBlock
      );
      setCopied(kind);
      return true;
    } catch {
      setCopyError("Could not copy. Select the text and copy it manually.");
      return false;
    }
  };

  return (
    <>
      <section aria-label="Agent access" className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
              <Bot className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold tracking-tight">
                Your agents
              </h3>
              <p className="mt-1 hidden max-w-md text-sm leading-relaxed text-muted-foreground sm:block">
                See who has access, what they can do, and which agents can
                complete work.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              ref={setupTriggerRef}
              onClick={() => {
                setCopyError(null);
                setSetupOpen(true);
              }}
            >
              <BookOpenText className="h-4 w-4" aria-hidden /> Setup guide
            </Button>
            <Button
              ref={newCredentialRef}
              type="button"
              disabled={!accessSummary || isLoadingAccessSummary}
              onClick={openCreation}
            >
              <Plus className="h-4 w-4" aria-hidden /> New credential
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border/60 rounded-xl border border-border/60 bg-muted/20">
          {[
            {
              label: "Active agents",
              mobileLabel: "Active",
              count: active.length,
              icon: Bot,
            },
            {
              label: "Can complete tasks",
              mobileLabel: "Can complete",
              count: canComplete.length,
              icon: CheckCheck,
            },
            {
              label: "Expired or revoked",
              mobileLabel: "Inactive",
              count: credentials.length - active.length,
              icon: ShieldX,
            },
          ].map(({ label, mobileLabel, count, icon: Icon }) => (
            <div
              key={label}
              className="flex min-w-0 items-center gap-2.5 p-3 sm:p-4"
            >
              <dt className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{mobileLabel}</span>
              </dt>
              <dd className="order-first text-2xl font-semibold leading-none tabular-nums">
                {accessSummary ? count : "—"}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70">
          <div
            role="group"
            aria-label="Agent access views"
            className="flex gap-5"
          >
            {(
              [
                ["credentials", "Credentials", KeyRound],
                ["activity", "Activity", Activity],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLoadingAccessSummary}
            onClick={onRefreshAccess}
            className="mb-2 text-muted-foreground"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoadingAccessSummary ? "animate-spin" : ""}`}
              aria-hidden
            />{" "}
            Refresh
          </Button>
        </div>
        {accessLoadError ? (
          <div
            role="alert"
            aria-label="Credential loading error"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="text-sm font-medium">We couldn’t load agent access</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {accessLoadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={isLoadingAccessSummary}
              onClick={onRefreshAccess}
            >
              Retry loading credentials
            </Button>
          </div>
        ) : null}
        {isLoadingAccessSummary ? (
          <p role="status" className="text-sm text-muted-foreground">
            {accessSummary
              ? "Refreshing credentials..."
              : "Loading credentials..."}
          </p>
        ) : null}
        {!accessSummary && isLoadingAccessSummary ? (
          <div aria-hidden className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl bg-muted/50"
              />
            ))}
          </div>
        ) : null}
        {view === "credentials" && accessSummary ? (
          <>
            {credentials.length ? (
              <ProjectAgentCredentialList
                credentials={credentials}
                mutatingCredentialId={mutatingCredentialId}
                onManageCredential={(credential, trigger) => {
                  manageTriggerRef.current = trigger;
                  onClearActionError();
                  setManagedId(credential.id);
                }}
                onUpdateCapabilities={onUpdateCapabilities}
                actionError={actionError}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-background/40 px-6 py-12 text-center">
                <Bot
                  className="mx-auto h-10 w-10 text-muted-foreground/60"
                  aria-hidden
                />
                <h4 className="mt-4 text-base font-semibold">
                  Invite your first agent
                </h4>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Create a credential for an assistant or automation. You choose
                  its access to this project.
                </p>
                <Button
                  type="button"
                  className="mt-5"
                  variant="outline"
                  onClick={openCreation}
                >
                  Create your first credential{" "}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
            <div className="flex items-start gap-2.5 rounded-xl bg-muted/35 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              <p>
                You choose which agents may mark tasks as Done. Turn on task
                completion for each trusted agent; changes save immediately and
                also require Task Write access.
              </p>
            </div>
          </>
        ) : null}
        {view === "activity" && accessSummary ? (
          <section aria-label="Agent activity" className="min-w-0">
            <div className="mb-4">
              <h4 className="text-sm font-semibold">Recent activity</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Credential changes, connections, and requests from your agents.
              </p>
            </div>
            {!accessSummary.recentEvents.length ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No agent activity yet.
              </p>
            ) : (
              <ol className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-background/60">
                {accessSummary.recentEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex min-w-0 items-start gap-3 p-4"
                  >
                    <span className="mt-0.5 rounded-lg bg-muted p-2">
                      <Activity
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatAgentAuditAction(event.action)}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {event.credentialLabel ?? "Unknown agent"} ·{" "}
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                      {event.httpMethod && event.path ? (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer">
                            Request details
                          </summary>
                          <code className="mt-2 block break-all">
                            {event.httpMethod} {event.path}
                          </code>
                          {event.requestId ? (
                            <p className="mt-1 break-all">
                              Request id: {event.requestId}
                            </p>
                          ) : null}
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!isCreatingCredential) setCreateOpen(open);
        }}
      >
        <DialogContent
          data-agent-access-dialog="true"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (!isCreatingCredential) setCreateOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!latestIssuedSecret) newCredentialRef.current?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            creationInputRef.current?.focus();
          }}
          dismissible={!isCreatingCredential}
          className={`${SLIM_SCROLLBAR_CLASSES} z-[160] max-h-[90dvh] max-w-xl overflow-y-auto rounded-2xl p-5 sm:p-6`}
          overlayClassName="z-[150]"
        >
          <DialogCloseButton
            label="Close credential creation"
            disabled={isCreatingCredential}
            onClick={() => setCreateOpen(false)}
          />
          <div className="mb-6 pr-8">
            <DialogTitle className="text-lg font-semibold">
              New agent credential
            </DialogTitle>
            <DialogDescription className="mt-1.5 leading-relaxed">
              Give an agent a name and choose the access it needs. You’ll get
              its API key after creation.
            </DialogDescription>
          </div>
          <ProjectAgentCredentialForm
            inputRef={creationInputRef}
            isCreating={isCreatingCredential}
            error={
              actionError?.action === "create" ? actionError.message : null
            }
            onCreate={onCreateCredential}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ProjectAgentCredentialDetailsDialog
        credential={managed}
        onClosedFocus={() => {
          if (!latestIssuedSecret && manageTriggerRef.current?.isConnected)
            manageTriggerRef.current.focus();
        }}
        isMutating={busy}
        actionError={actionError}
        onClose={() => setManagedId(null)}
        onUpdateCapabilities={onUpdateCapabilities}
        onUpdateScopes={onUpdateScopes}
        onUpdateCredentialLabels={onUpdateCredentialLabels}
        onRotateCredential={onRotateCredential}
        onRevokeCredential={onRevokeCredential}
      />

      <ProjectAgentIssuedKeyDialog
        latestIssuedSecret={latestIssuedSecret}
        copied={copied}
        copyError={copyError}
        onDismissLatestSecret={onDismissLatestSecret}
        onClosedFocus={() => newCredentialRef.current?.focus()}
        onCopyKey={() => copy("key")}
        onCopyEnv={() => void copy("env")}
      />

      <ProjectAgentSetupGuideDialog
        setupOpen={setupOpen}
        onClosedFocus={() => setupTriggerRef.current?.focus()}
        onClose={() => setSetupOpen(false)}
        docs={docs}
        envBlock={envBlock}
        copied={copied}
        copyError={copyError}
        onCopyEnv={() => void copy("env")}
      />
    </>
  );
}
