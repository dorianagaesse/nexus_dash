"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BriefcaseBusiness,
  FileText,
  ListTodo,
  NotebookTabs,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ProjectMemberSummary,
  ProjectResponsibilityInventory,
  ResponsibilityResolution,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

type OffboardingDialogVariant =
  "remove-member" | "revoke-agent" | "transfer-owner";

interface ProjectOffboardingDialogProps {
  isOpen: boolean;
  variant: OffboardingDialogVariant;
  actorLabel: string;
  transferTargetLabel?: string;
  inventory: ProjectResponsibilityInventory | null;
  replacementCandidates: ProjectMemberSummary[];
  suggestedReplacementUserId?: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: {
    previousOwnerLeaves: boolean;
    responsibilityResolution: ResponsibilityResolution | null;
  }) => void | Promise<void>;
}

const INVENTORY_ROWS = [
  { key: "taskAssignments", label: "Active task assignments", icon: ListTodo },
  { key: "contextCardStewardships", label: "Context cards", icon: FileText },
  {
    key: "meetingNoteStewardships",
    label: "Active meeting notes",
    icon: NotebookTabs,
  },
  {
    key: "meetingTodoAssignments",
    label: "Open meeting todos",
    icon: BriefcaseBusiness,
  },
] as const;

export function ProjectOffboardingDialog({
  isOpen,
  variant,
  actorLabel,
  transferTargetLabel,
  inventory,
  replacementCandidates,
  suggestedReplacementUserId,
  isLoading,
  isSubmitting,
  error,
  onCancel,
  onConfirm,
}: ProjectOffboardingDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [previousOwnerLeaves, setPreviousOwnerLeaves] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<"reassign" | "unassign">(
    "reassign"
  );
  const [replacementUserId, setReplacementUserId] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPreviousOwnerLeaves(false);
    setResolutionMode(
      replacementCandidates.length > 0 ? "reassign" : "unassign"
    );
    setReplacementUserId(
      suggestedReplacementUserId ?? replacementCandidates[0]?.id ?? ""
    );
  }, [isOpen, replacementCandidates, suggestedReplacementUserId]);

  const isTransfer = variant === "transfer-owner";
  const mustResolveResponsibilities =
    Boolean(inventory?.total) && (!isTransfer || previousOwnerLeaves);
  const canSubmit =
    !isLoading &&
    !isSubmitting &&
    Boolean(inventory) &&
    (!mustResolveResponsibilities ||
      resolutionMode === "unassign" ||
      Boolean(replacementUserId));
  const title = isTransfer
    ? `Transfer ownership to ${transferTargetLabel ?? "collaborator"}?`
    : variant === "revoke-agent"
      ? `Revoke ${actorLabel}?`
      : `Remove ${actorLabel}?`;
  const confirmLabel = isTransfer
    ? previousOwnerLeaves
      ? "Transfer and leave"
      : "Transfer ownership"
    : variant === "revoke-agent"
      ? "Revoke credential"
      : "Remove collaborator";

  const handleConfirm = () => {
    const responsibilityResolution: ResponsibilityResolution | null =
      mustResolveResponsibilities
        ? resolutionMode === "reassign"
          ? { mode: "reassign", replacementUserId }
          : { mode: "unassign" }
        : null;
    void onConfirm({ previousOwnerLeaves, responsibilityResolution });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="z-[150] max-h-[min(90dvh,44rem)] w-full max-w-xl overflow-y-auto"
        dismissible={!isSubmitting}
        overlayClassName="z-[140]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            <DialogDescription className="leading-6">
              {isTransfer
                ? "The new owner will control project settings, collaborators, and agent access. Choose whether you keep editor access."
                : "Review active accountability before access changes. Historical creator and activity records will stay readable."}
            </DialogDescription>
          </div>

          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground"
            >
              Checking active responsibilities...
            </div>
          ) : inventory ? (
            <section
              aria-labelledby="responsibility-inventory-title"
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id="responsibility-inventory-title"
                  className="text-sm font-semibold"
                >
                  Active responsibilities
                </h3>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                  {inventory.total} total
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {INVENTORY_ROWS.map(({ key, label, icon: Icon }) => (
                  <div
                    key={key}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {inventory[key]}
                    </span>
                  </div>
                ))}
              </div>
              {inventory.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active responsibility needs reassignment.
                </p>
              ) : null}
            </section>
          ) : null}

          {isTransfer ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                Your access after transfer
              </legend>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3">
                <input
                  type="radio"
                  name="owner-transfer-access"
                  checked={!previousOwnerLeaves}
                  onChange={() => setPreviousOwnerLeaves(false)}
                  disabled={isSubmitting}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Stay as editor
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    Keep project access after handing over ownership.
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <input
                  type="radio"
                  name="owner-transfer-access"
                  checked={previousOwnerLeaves}
                  onChange={() => setPreviousOwnerLeaves(true)}
                  disabled={isSubmitting}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-destructive">
                    Leave project
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    Transfer ownership and remove your own access in one atomic
                    handoff.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {mustResolveResponsibilities ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                Resolve active responsibility
              </legend>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3">
                <input
                  type="radio"
                  name="responsibility-resolution"
                  checked={resolutionMode === "reassign"}
                  onChange={() => setResolutionMode("reassign")}
                  disabled={replacementCandidates.length === 0 || isSubmitting}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block text-sm font-medium">
                    Reassign active work
                  </span>
                  <select
                    aria-label="Responsibility replacement"
                    value={replacementUserId}
                    onChange={(event) =>
                      setReplacementUserId(event.target.value)
                    }
                    onClick={(event) => event.stopPropagation()}
                    disabled={resolutionMode !== "reassign" || isSubmitting}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  >
                    {replacementCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.displayName} ({candidate.role})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3">
                <input
                  type="radio"
                  name="responsibility-resolution"
                  checked={resolutionMode === "unassign"}
                  onChange={() => setResolutionMode("unassign")}
                  disabled={isSubmitting}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Leave active work unassigned
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    The work remains visible and can be assigned later.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <DialogClose asChild>
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                className="min-h-11 w-full sm:w-auto"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={
                previousOwnerLeaves || !isTransfer ? "destructive" : "default"
              }
              disabled={!canSubmit}
              className="min-h-11 w-full sm:w-auto"
              onClick={handleConfirm}
            >
              {isSubmitting ? "Applying handoff..." : confirmLabel}
              {isTransfer ? (
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              ) : null}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
