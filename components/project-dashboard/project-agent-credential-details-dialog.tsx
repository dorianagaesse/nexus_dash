"use client";
import { RefreshCw, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogCloseButton } from "./project-agent-dialog-close";
import { AgentTaskCompletionSwitch } from "./project-agent-credential-list";
import {
  describeAgentAccess,
  describeAgentResources,
  formatAgentDate,
} from "./project-agent-access-presentation";
import {
  formatAgentCredentialStatus,
  type ProjectAgentCredentialSummary,
  type ProjectAgentAccessActionError,
} from "./project-dashboard-owner-actions.shared";
interface Props {
  credential: ProjectAgentCredentialSummary | null;
  isMutating: boolean;
  actionError: ProjectAgentAccessActionError | null;
  onClose: () => void;
  onUpdateCapabilities: (
    credential: ProjectAgentCredentialSummary,
    allowed: boolean
  ) => void;
  onRotateCredential: (credential: ProjectAgentCredentialSummary) => void;
  onRevokeCredential: (credential: ProjectAgentCredentialSummary) => void;
}
export function ProjectAgentCredentialDetailsDialog({
  credential,
  isMutating,
  actionError,
  onClose,
  onUpdateCapabilities,
  onRotateCredential,
  onRevokeCredential,
}: Props) {
  return (
    <Dialog
      open={Boolean(credential)}
      onOpenChange={(open) => {
        if (!open && !isMutating) onClose();
      }}
    >
      <DialogContent
        dismissible={!isMutating}
        className="z-[160] max-h-[90dvh] max-w-xl overflow-y-auto rounded-2xl p-5 sm:p-6"
        overlayClassName="z-[150]"
      >
        {credential ? (
          <>
            <DialogCloseButton
              label="Close credential details"
              disabled={isMutating}
              onClick={() => onClose()}
            />
            <div className="mb-6 min-w-0 pr-8">
              <DialogTitle className="break-all text-lg font-semibold">
                {credential.label}
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Manage this agent’s access and API key.
              </DialogDescription>
              <Badge variant="outline" className="mt-3">
                {formatAgentCredentialStatus(credential.status)}
              </Badge>
            </div>
            <div className="space-y-6">
              <section className="rounded-xl border border-border/70 p-4">
                <h4 className="text-sm font-semibold">
                  {describeAgentAccess(credential.scopes)}
                </h4>
                <dl className="mt-3 space-y-2 text-xs">
                  {describeAgentResources(credential.scopes).map((resource) => (
                    <div
                      key={resource.name}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <dt className="text-muted-foreground">{resource.name}</dt>
                      <dd>{resource.actions}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Task completion</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Allow this agent to move tasks to Done without waiting for
                    your review. Task Write permission is also required.
                  </p>
                </div>
                <AgentTaskCompletionSwitch
                  credential={credential}
                  disabled={isMutating}
                  onChange={(allowed) =>
                    onUpdateCapabilities(credential, allowed)
                  }
                />
                {actionError?.action === "capabilities" &&
                actionError.credentialId === credential.id ? (
                  <p
                    role="alert"
                    aria-label="Agent capabilities error"
                    className="text-sm text-destructive"
                  >
                    {actionError.message}
                  </p>
                ) : null}
              </section>
              <section>
                <h4 className="mb-3 text-sm font-semibold">
                  Credential details
                </h4>
                <dl className="grid min-w-0 grid-cols-2 gap-4 text-xs">
                  {[
                    ["Created", formatAgentDate(credential.createdAt)],
                    [
                      "Expiry",
                      credential.expiresAt
                        ? formatAgentDate(credential.expiresAt)
                        : "No expiry",
                    ],
                    ["Last used", formatAgentDate(credential.lastUsedAt)],
                    [
                      "Last exchanged",
                      formatAgentDate(credential.lastExchangedAt),
                    ],
                    ["Last rotated", formatAgentDate(credential.lastRotatedAt)],
                    ["Revoked", formatAgentDate(credential.revokedAt)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-medium">{value}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 min-w-0">
                    <dt className="text-muted-foreground">Public id</dt>
                    <dd className="mt-1 break-all font-mono">
                      {credential.publicId}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="space-y-4 border-t border-border/70 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium">Replace the API key</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Rotate a lost or exposed key. Update the agent with the
                      replacement key afterwards.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={credential.status !== "active" || isMutating}
                    onClick={() => onRotateCredential(credential)}
                    aria-label={`Rotate key for ${credential.label}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Rotate key
                  </Button>
                </div>
                {actionError?.action === "rotate" ? (
                  <p
                    role="alert"
                    aria-label="Credential rotation error"
                    className="text-sm text-destructive"
                  >
                    {actionError.message}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium">
                      Remove this agent’s access
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Revoke the credential when this agent no longer needs the
                      project.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-destructive/20 text-destructive hover:bg-destructive/10"
                    disabled={credential.status === "revoked" || isMutating}
                    onClick={() => {
                      onClose();
                      onRevokeCredential(credential);
                    }}
                    aria-label={`Revoke ${credential.label}`}
                  >
                    <ShieldX className="h-3.5 w-3.5" aria-hidden /> Revoke
                    access
                  </Button>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
