"use client";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogCloseButton } from "./project-agent-dialog-close";
interface Props {
  setupOpen: boolean;
  onClose: () => void;
  onClosedFocus: () => void;
  docs: { docsUrl: string; openApiUrl: string };
  envBlock: string;
  copied: "key" | "env" | null;
  copyError: string | null;
  onCopyEnv: () => void;
}
export function ProjectAgentSetupGuideDialog({
  setupOpen,
  onClose,
  onClosedFocus,
  docs,
  envBlock,
  copied,
  copyError,
  onCopyEnv,
}: Props) {
  return (
    <Dialog
      open={setupOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-agent-access-dialog="true"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosedFocus();
        }}
        className="z-[160] max-h-[90dvh] max-w-xl overflow-y-auto rounded-2xl p-5 sm:p-6"
        overlayClassName="z-[150]"
      >
        <DialogCloseButton
          label="Close setup guide"
          onClick={() => onClose()}
        />
        <DialogTitle className="pr-8 text-lg font-semibold">
          Connect an agent
        </DialogTitle>
        <DialogDescription className="mt-2">
          A short setup guide for this project.
        </DialogDescription>
        <ol className="my-6 space-y-5">
          {[
            [
              "Create a credential",
              "Choose an agent name, its permissions, and an expiry date.",
            ],
            [
              "Save the API key",
              "Copy the key shown after creation. If you lose it, rotate the credential to get a replacement.",
            ],
            [
              "Configure your agent",
              "Give your agent the project setup and API key. The hosted guide explains the connection steps.",
            ],
          ].map(([title, description], index) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={docs.docsUrl} target="_blank" rel="noreferrer">
              Hosted docs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={docs.openApiUrl} target="_blank" rel="noreferrer">
              OpenAPI JSON
            </a>
          </Button>
        </div>
        <details className="mt-5 min-w-0 rounded-xl border border-border/70 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Environment setup
          </summary>
          <pre className="mt-3 min-w-0 max-w-full overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
            <code>{envBlock}</code>
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => onCopyEnv()}
          >
            {copied === "env" ? "Copied env" : "Copy env block"}
          </Button>
        </details>
        {copyError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {copyError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
