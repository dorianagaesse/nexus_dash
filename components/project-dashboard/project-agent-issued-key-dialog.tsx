"use client";
import { useRef } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SLIM_SCROLLBAR_CLASSES } from "@/components/ui/scrollbar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProjectAgentCredentialIssuedSecret } from "./project-dashboard-owner-actions.shared";
import { DialogCloseButton } from "./project-agent-dialog-close";
interface Props {
  latestIssuedSecret:
    | (ProjectAgentCredentialIssuedSecret & { mode: "created" | "rotated" })
    | null;
  copied: "key" | "env" | null;
  copyError: string | null;
  onDismissLatestSecret: () => void;
  onClosedFocus: () => void;
  onCopyKey: () => void;
  onCopyEnv: () => void;
}
export function ProjectAgentIssuedKeyDialog({
  latestIssuedSecret,
  copied,
  copyError,
  onDismissLatestSecret,
  onClosedFocus,
  onCopyKey,
  onCopyEnv,
}: Props) {
  const keyInputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={Boolean(latestIssuedSecret)}
      onOpenChange={(open) => {
        if (!open) onDismissLatestSecret();
      }}
    >
      <DialogContent
        data-agent-access-dialog="true"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onDismissLatestSecret();
          }
        }}
        className={`${SLIM_SCROLLBAR_CLASSES} z-[180] max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl p-5 sm:p-6`}
        overlayClassName="z-[170]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keyInputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosedFocus();
        }}
      >
        <DialogCloseButton
          label="Close API key"
          onClick={onDismissLatestSecret}
        />
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </div>
        <DialogTitle className="pr-8 text-lg font-semibold">
          {latestIssuedSecret?.mode === "rotated"
            ? "Save your replacement API key"
            : "Your agent credential is ready"}
        </DialogTitle>
        <DialogDescription className="mt-2 leading-relaxed">
          Copy this key for{" "}
          <span className="[overflow-wrap:anywhere] font-medium text-foreground">
            {latestIssuedSecret?.credential.label}
          </span>{" "}
          and store it safely. It is shown only once.
        </DialogDescription>
        <div className="mt-5 space-y-3">
          <label htmlFor="issued-agent-key" className="text-xs font-medium">
            API key
          </label>
          <input
            id="issued-agent-key"
            ref={keyInputRef}
            readOnly
            value={latestIssuedSecret?.apiKey ?? ""}
            aria-label={`API key for ${latestIssuedSecret?.credential.label}`}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-muted/30 px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onCopyKey()}
              aria-label={`Copy API key for ${latestIssuedSecret?.credential.label}`}
            >
              {copied === "key" ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copied === "key" ? "Copied key" : "Copy API key"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onCopyEnv()}>
              {copied === "env" ? "Copied setup" : "Copy env block"}
            </Button>
          </div>
          {copied ? (
            <p role="status" className="text-xs text-muted-foreground">
              {copied === "key"
                ? "API key copied."
                : "Environment block copied."}
            </p>
          ) : null}
          {copyError ? (
            <p role="alert" className="text-sm text-destructive">
              {copyError}
            </p>
          ) : null}
        </div>
        <p className="mt-5 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          Next: give this key to your agent using the setup guide. You can
          manage its permissions from the credential list.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p id="issued-agent-key-dismiss-hint" className="text-xs text-muted-foreground">
            Once hidden, this key cannot be viewed again.
          </p>
          <Button
            type="button"
            variant="outline"
            aria-describedby="issued-agent-key-dismiss-hint"
            onClick={onDismissLatestSecret}
          >
            Hide key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
