"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CheckCircle2, ShieldAlert, Terminal } from "lucide-react";

import {
  AGENT_CREDENTIAL_PRESETS,
  AGENT_SCOPE_DEFINITIONS,
  matchAgentCredentialPreset,
  type AgentScope,
} from "@/lib/agent-access";
import { AgentCredentialDescriptiveLabels } from "@/components/agent-credential-descriptive-labels";
import { ProjectAgentPermissionFields } from "@/components/project-dashboard/project-agent-permission-fields";
import { Button } from "@/components/ui/button";
import type {
  ApprovedCliGrantSummary,
  CliPairingInspectionView,
  OwnedProjectForCliApproval,
} from "@/lib/services/agent-cli-pairing-service";

const fieldClass =
  "min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function describeGrantedPermissions(scopes: AgentScope[]): string {
  return (
    scopes
      .map(
        (scope) =>
          AGENT_SCOPE_DEFINITIONS.find((entry) => entry.scope === scope)?.label ??
          scope
      )
      .join(" · ") || "None"
  );
}

function pickInitialProject(
  projects: OwnedProjectForCliApproval[],
  requestedProjectId: string | null | undefined
): OwnedProjectForCliApproval | null {
  if (!projects.length) {
    return null;
  }
  if (requestedProjectId) {
    const match = projects.find((project) => project.id === requestedProjectId);
    if (match) {
      return match;
    }
  }
  return (
    projects.find((project) => project.identities.length > 0) ?? projects[0]!
  );
}

function pickInitialIdentity(
  project: OwnedProjectForCliApproval | null,
  requestedIdentityId: string | null | undefined
) {
  if (!project || !project.identities.length) {
    return null;
  }
  if (requestedIdentityId) {
    const match = project.identities.find(
      (identity) => identity.id === requestedIdentityId
    );
    if (match) {
      return match;
    }
  }
  return project.identities[0]!;
}

const ERROR_COPY: Record<string, string> = {
  "invalid-pairing-code":
    "Enter the eight-character confirmation code shown by nd login.",
  "pairing-not-found":
    "That confirmation code was not found. Run nd login in your terminal to generate a new code.",
  "pairing-expired":
    "This pairing request expired. Run nd login in your terminal to generate a fresh code.",
  "pairing-denied":
    "This pairing request was already declined. Run nd login in your terminal if you want to pair again.",
  "pairing-already-approved":
    "This pairing request has already been approved.",
  "pairing-state-changed":
    "The pairing request changed before approval completed. Refresh this page and check its status.",
  "identity-not-found":
    "The selected agent identity is no longer available. Refresh this page and choose an active identity.",
  "invalid-device-grants":
    "Selected installation permissions exceed the identity’s current grants. Review the permissions and try again.",
  "invalid-approval-grants":
    "Select a project, an active identity, an installation name, and at least one permission.",
  forbidden:
    "Only the project owner can approve agent CLI installations for that project.",
};

function ApprovedSummarySection({ grant }: { grant: ApprovedCliGrantSummary }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            CLI installation approved
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Return to your terminal. <code>nd login</code> finishes automatically
            and saves this installation grant in your OS credential vault.
          </p>
        </div>
      </div>

      <dl className="grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-medium">Project</dt>
          <dd className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">
            {grant.projectName}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium">Agent identity</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="break-words font-medium text-foreground [overflow-wrap:anywhere]">
              {grant.identityName}
            </span>
            <AgentCredentialDescriptiveLabels labels={grant.descriptiveLabels} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium">Installation</dt>
          <dd className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">
            {grant.deviceName}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium">Move tasks to Done</dt>
          <dd className="mt-1 text-muted-foreground">
            {grant.canMoveTasksToDone ? "Allowed" : "Not allowed"}
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="font-medium">Granted permissions</dt>
          <dd className="mt-1 leading-relaxed text-muted-foreground">
            {describeGrantedPermissions(grant.scopes)}
          </dd>
        </div>
      </dl>

      <details className="border-t border-border pt-3 text-xs text-muted-foreground">
        <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-foreground">
          Technical details
        </summary>
        <p className="mt-1 break-all">Identity ID: {grant.identityId}</p>
        <p className="mt-1 break-all">Installation ID: {grant.deviceId}</p>
        <p className="mt-1 tabular-nums">
          Grant expires {new Date(grant.deviceExpiresAt).toLocaleString()}
        </p>
      </details>

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/projects/${grant.projectId}`}>Open project</Link>
        </Button>
      </div>
    </div>
  );
}

export function AgentCliAuthorizeCard({
  initialView,
}: {
  initialView: CliPairingInspectionView;
}) {
  const [view, setView] = useState<CliPairingInspectionView>(initialView);
  const [codeDraft, setCodeDraft] = useState(initialView.userCode ?? "");

  const initialProject = pickInitialProject(
    initialView.ownedProjects,
    initialView.request?.requestedProjectId
  );
  const initialIdentity = pickInitialIdentity(
    initialProject,
    initialView.request?.requestedIdentityId
  );

  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const [identityId, setIdentityId] = useState(initialIdentity?.id ?? "");
  const [deviceName, setDeviceName] = useState(
    initialView.request?.requestedDeviceName ?? ""
  );
  const [scopes, setScopes] = useState<AgentScope[]>(
    initialIdentity?.scopes ?? []
  );
  const [allowDone, setAllowDone] = useState(
    initialIdentity?.canMoveTasksToDone ?? false
  );
  const [busy, setBusy] = useState<"lookup" | "approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedDone, setDeniedDone] = useState(false);

  const selectedProject =
    view.ownedProjects.find((project) => project.id === projectId) ?? null;
  const selectedIdentity =
    selectedProject?.identities.find((identity) => identity.id === identityId) ??
    null;

  const effectiveScopes = scopes.filter((scope) =>
    selectedIdentity?.scopes.includes(scope)
  );
  const effectiveDone = allowDone && Boolean(selectedIdentity?.canMoveTasksToDone);

  function syncSelectionFromView(nextView: CliPairingInspectionView) {
    const nextProject = pickInitialProject(
      nextView.ownedProjects,
      nextView.request?.requestedProjectId
    );
    const nextIdentity = pickInitialIdentity(
      nextProject,
      nextView.request?.requestedIdentityId
    );
    setProjectId(nextProject?.id ?? "");
    setIdentityId(nextIdentity?.id ?? "");
    setDeviceName(nextView.request?.requestedDeviceName ?? "");
    setScopes(nextIdentity?.scopes ?? []);
    setAllowDone(nextIdentity?.canMoveTasksToDone ?? false);
  }

  async function lookupCode(raw: string) {
    setBusy("lookup");
    setError(null);
    setDeniedDone(false);
    try {
      const response = await fetch(
        `/api/auth/agent/cli/approve?code=${encodeURIComponent(raw.trim())}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error("Could not verify that confirmation code. Try again.");
      }
      const nextView = (await response.json()) as CliPairingInspectionView;
      setView(nextView);
      syncSelectionFromView(nextView);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Could not verify that confirmation code. Try again."
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitDecision(decision: "approve" | "deny") {
    if (!view.userCode) {
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch("/api/auth/agent/cli/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          decision === "deny"
            ? { code: view.userCode, decision: "deny" }
            : {
                code: view.userCode,
                decision: "approve",
                projectId,
                identityId,
                deviceName,
                scopes: effectiveScopes,
                canMoveTasksToDone: effectiveDone,
              }
        ),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const code = typeof payload.error === "string" ? payload.error : "";
        throw new Error(
          ERROR_COPY[code] ??
            `Request could not be completed (${code || response.status}). Review the fields and try again.`
        );
      }

      if (decision === "deny") {
        setDeniedDone(true);
        setView((current) => ({ ...current, state: "denied", request: null }));
        return;
      }

      setView((current) => ({
        ...current,
        state: "already-approved",
        request: null,
        approvedGrant: payload as unknown as ApprovedCliGrantSummary,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Request could not be completed. Try again."
      );
    } finally {
      setBusy(null);
    }
  }

  const showLookupForm =
    view.state === "code-required" ||
    view.state === "invalid-code" ||
    view.state === "not-found" ||
    view.state === "expired";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
        >
          {error}
        </div>
      ) : null}

      {view.state === "already-approved" && view.approvedGrant ? (
        <ApprovedSummarySection grant={view.approvedGrant} />
      ) : view.state === "already-approved" ? (
        <div className="space-y-3" role="status">
          <h2 className="text-lg font-semibold tracking-tight">
            Pairing code already used
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            This confirmation code was already approved. Run{" "}
            <code>nd login</code> in your terminal to authorize another CLI
            installation.
          </p>
        </div>
      ) : view.state === "denied" || deniedDone ? (
        <div className="space-y-4" role="status">
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                CLI pairing declined
              </h2>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                No access was granted. If you started this request yourself, run{" "}
                <code>nd login</code> again in your terminal.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setDeniedDone(false);
              setCodeDraft("");
              setView((current) => ({
                ...current,
                state: "code-required",
                userCode: null,
                request: null,
              }));
            }}
          >
            Enter another code
          </Button>
        </div>
      ) : showLookupForm ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void lookupCode(codeDraft);
          }}
        >
          {view.state === "invalid-code" ? (
            <p role="alert" className="text-sm text-destructive">
              Enter a valid eight-character confirmation code such as ABCD-EFGH.
            </p>
          ) : view.state === "not-found" ? (
            <p role="alert" className="text-sm text-destructive">
              No pending CLI request matched <code>{view.userCode}</code>. Check
              your terminal or run <code>nd login</code> again.
            </p>
          ) : view.state === "expired" ? (
            <p role="alert" className="text-sm text-destructive">
              Confirmation code <code>{view.userCode}</code> expired. Run{" "}
              <code>nd login</code> in your terminal for a new code.
            </p>
          ) : (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Run <code>nd login</code> on the machine you want to connect, then
              enter the eight-character confirmation code shown in your terminal.
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="cli-authorize-code"
              className="block text-sm font-medium"
            >
              Confirmation code
            </label>
            <input
              id="cli-authorize-code"
              className={`${fieldClass} font-mono uppercase tracking-wider`}
              required
              maxLength={16}
              placeholder="ABCD-EFGH"
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="min-h-11"
            disabled={busy !== null || !codeDraft.trim()}
          >
            {busy === "lookup" ? "Checking code…" : "Continue"}
          </Button>
        </form>
      ) : view.state === "ready" && view.request && view.userCode ? (
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedIdentity || !effectiveScopes.length) {
              return;
            }
            void submitDecision("approve");
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                Confirm this code matches your terminal before approving
              </p>
              <code
                data-cli-user-code
                className="block font-mono text-lg font-semibold tracking-wider text-foreground"
              >
                {view.userCode}
              </code>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              Expires {new Date(view.request.expiresAt).toLocaleTimeString()}
            </p>
          </div>

          {!view.ownedProjects.length ? (
            <div className="space-y-3 border-t border-border pt-5 text-sm">
              <p className="font-medium">You do not own any projects yet</p>
              <p className="max-w-prose leading-relaxed text-muted-foreground">
                Only project owners can authorize agent identities. Create a
                project and an agent identity first, then run{" "}
                <code>nd login</code> again.
              </p>
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/projects">Go to projects</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <label
                    htmlFor="cli-authorize-project"
                    className="block text-sm font-medium"
                  >
                    Project
                  </label>
                  <select
                    id="cli-authorize-project"
                    className={fieldClass}
                    value={projectId}
                    disabled={busy !== null}
                    onChange={(event) => {
                      const nextProjectId = event.target.value;
                      setProjectId(nextProjectId);
                      const nextProject =
                        view.ownedProjects.find(
                          (entry) => entry.id === nextProjectId
                        ) ?? null;
                      const nextIdentity = pickInitialIdentity(
                        nextProject,
                        view.request?.requestedIdentityId
                      );
                      setIdentityId(nextIdentity?.id ?? "");
                      setScopes(nextIdentity?.scopes ?? []);
                      setAllowDone(nextIdentity?.canMoveTasksToDone ?? false);
                    }}
                  >
                    {view.ownedProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <label
                    htmlFor="cli-authorize-device-name"
                    className="block text-sm font-medium"
                  >
                    Installation name
                  </label>
                  <input
                    id="cli-authorize-device-name"
                    className={fieldClass}
                    required
                    maxLength={80}
                    disabled={busy !== null}
                    value={deviceName}
                    onChange={(event) => setDeviceName(event.target.value)}
                    placeholder="Work laptop (nd)"
                  />
                </div>
              </div>

              {selectedProject && !selectedProject.identities.length ? (
                <div className="space-y-3 border-t border-border pt-5 text-sm">
                  <p className="font-medium">
                    No active agent identities in {selectedProject.name}
                  </p>
                  <p className="max-w-prose leading-relaxed text-muted-foreground">
                    Create an agent identity in Project Settings → Agent access
                    first, then refresh this page to approve the CLI
                    installation for that identity.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="min-h-11">
                      <Link href={`/projects/${selectedProject.id}`}>
                        Open {selectedProject.name}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      disabled={busy !== null}
                      onClick={() => {
                        if (view.userCode) {
                          void lookupCode(view.userCode);
                        }
                      }}
                    >
                      Refresh identities
                    </Button>
                  </div>
                </div>
              ) : selectedProject ? (
                <>
                  <fieldset className="min-w-0 space-y-2 border-t border-border pt-5">
                    <legend className="text-sm font-medium">
                      Existing agent identity
                    </legend>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Select the existing identity this CLI installation will
                      act as. Multiple machines can share one identity while
                      keeping separate revocable installation grants.
                    </p>
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {selectedProject.identities.map((identity) => {
                        const checked = identity.id === identityId;
                        return (
                          <label
                            key={identity.id}
                            className={`flex min-h-12 cursor-pointer items-start gap-3 px-3.5 py-3 text-sm transition-colors hover:bg-muted/50 ${checked ? "bg-muted/70" : ""}`}
                          >
                            <input
                              type="radio"
                              name="agent-identity"
                              value={identity.id}
                              checked={checked}
                              disabled={busy !== null}
                              onChange={() => {
                                setIdentityId(identity.id);
                                setScopes(identity.scopes);
                                setAllowDone(identity.canMoveTasksToDone);
                              }}
                              className="mt-1 size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <Bot
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="break-words font-semibold [overflow-wrap:anywhere]">
                                  {identity.name}
                                </span>
                                <AgentCredentialDescriptiveLabels
                                  labels={identity.descriptiveLabels}
                                />
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground tabular-nums">
                                {describeGrantedPermissions(identity.scopes)} ·{" "}
                                {identity.pairedDeviceCount}{" "}
                                {identity.pairedDeviceCount === 1
                                  ? "paired installation"
                                  : "paired installations"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {selectedIdentity ? (
                    <div className="min-w-0 space-y-4 border-t border-border pt-5">
                      <div className="space-y-1">
                        <h3 className="text-sm font-medium">
                          Installation grant for {selectedIdentity.name}
                        </h3>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Valid for 90 days and revocable independently in
                          Project Settings → Agent access. Permissions stay
                          within {selectedIdentity.name}’s current ceiling.
                        </p>
                      </div>

                      <label className="block space-y-1 text-sm">
                        Task permission preset
                        <select
                          className={fieldClass}
                          disabled={busy !== null}
                          value={
                            matchAgentCredentialPreset(effectiveScopes)?.id ??
                            "custom"
                          }
                          onChange={(event) => {
                            const preset = AGENT_CREDENTIAL_PRESETS.find(
                              (entry) => entry.id === event.target.value
                            );
                            if (preset) {
                              setScopes(
                                preset.scopes.filter((scope) =>
                                  selectedIdentity.scopes.includes(scope)
                                )
                              );
                            }
                          }}
                        >
                          <option value="custom" disabled>
                            Custom permissions
                          </option>
                          {AGENT_CREDENTIAL_PRESETS.filter((preset) =>
                            preset.scopes.some((scope) =>
                              selectedIdentity.scopes.includes(scope)
                            )
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <ProjectAgentPermissionFields
                        value={effectiveScopes}
                        onChange={setScopes}
                        allowed={selectedIdentity.scopes}
                        disabled={busy !== null}
                      />

                      {selectedIdentity.canMoveTasksToDone ? (
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={effectiveDone}
                            disabled={busy !== null}
                            onChange={(event) =>
                              setAllowDone(event.target.checked)
                            }
                            className="size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          Allow moving tasks to Done from this installation
                          (requires Tasks edit)
                        </label>
                      ) : null}

                      <dl className="grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="font-medium text-foreground">
                            Selected identity
                          </dt>
                          <dd className="mt-0.5 break-all">
                            {selectedIdentity.name} ({selectedIdentity.id})
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="font-medium text-foreground">
                            Selected grant
                          </dt>
                          <dd className="mt-0.5 leading-relaxed">
                            {describeGrantedPermissions(effectiveScopes)}
                            {effectiveDone &&
                            effectiveScopes.includes("task:write")
                              ? " · Move to Done allowed"
                              : ""}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                {selectedIdentity ? (
                  <Button
                    type="submit"
                    className="min-h-11"
                    disabled={
                      busy !== null ||
                      !deviceName.trim() ||
                      !effectiveScopes.length
                    }
                  >
                    <Terminal className="size-4" aria-hidden="true" />
                    {busy === "approve"
                      ? "Approving installation…"
                      : `Approve ${selectedIdentity.name} for this CLI`}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy !== null}
                  onClick={() => void submitDecision("deny")}
                >
                  {busy === "deny" ? "Declining…" : "Decline request"}
                </Button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}
