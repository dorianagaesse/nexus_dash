"use client";

import { useState, type FormEvent } from "react";
import {
  Bug,
  Lightbulb,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  X,
} from "lucide-react";

import { useToast } from "@/components/toast-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrentAppPath } from "@/lib/hooks/use-current-app-path";
import {
  PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH,
  PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH,
  type ProductFeedbackReportType,
} from "@/lib/product-feedback";
import { cn } from "@/lib/utils";

type SubmissionState = "idle" | "submitting" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  "message-too-short": `Please share at least ${PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH} characters.`,
  "message-too-long": `Please keep your message under ${PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH.toLocaleString()} characters.`,
  "rate-limited": "You’ve sent several reports recently. Please try again in about an hour.",
  unauthorized: "Your session has expired. Sign in again, then retry.",
  "email-unverified": "Verify your email address before sending a report.",
  "delivery-failed": "NexusDash couldn’t send this report. Your message is still here—please retry.",
};

function readErrorMessage(error: unknown): string {
  if (typeof error === "string" && ERROR_MESSAGES[error]) {
    return ERROR_MESSAGES[error];
  }

  return "NexusDash couldn’t send this report. Your message is still here—please retry.";
}

function collectDiagnostics() {
  return {
    userAgent: window.navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    locale: window.navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function ProductFeedbackDialog({
  triggerVariant,
}: {
  triggerVariant: "desktop" | "mobile";
}) {
  const currentPath = useCurrentAppPath();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] =
    useState<ProductFeedbackReportType>("bug");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmitting = submissionState === "submitting";

  function resetForm() {
    setReportType("bug");
    setMessage("");
    setIncludeDiagnostics(true);
    setSubmissionState("idle");
    setErrorMessage(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) {
      return;
    }

    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedMessage = message.trim();

    if (normalizedMessage.length < PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH) {
      setSubmissionState("error");
      setErrorMessage(ERROR_MESSAGES["message-too-short"]);
      return;
    }

    setSubmissionState("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType,
          message: normalizedMessage,
          pagePath: currentPath,
          diagnostics: includeDiagnostics ? collectDiagnostics() : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };

      if (!response.ok) {
        setSubmissionState("error");
        setErrorMessage(readErrorMessage(payload.error));
        return;
      }

      setOpen(false);
      resetForm();
      pushToast({
        variant: "success",
        message: "Thanks—your report was sent to the NexusDash team.",
      });
    } catch {
      setSubmissionState("error");
      setErrorMessage(readErrorMessage(null));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={triggerVariant === "mobile" ? "Report a bug or feedback" : undefined}
          className={cn(
            "group flex min-h-11 items-center rounded-xl font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            triggerVariant === "desktop"
              ? "w-full gap-3 px-3 text-sm"
              : "shrink-0 gap-1.5 px-2 text-xs"
          )}
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center",
              triggerVariant === "desktop" ? "h-7 w-7" : "h-7 w-5"
            )}
          >
            <MessageSquarePlus
              className={triggerVariant === "desktop" ? "h-5 w-5" : "h-[18px] w-[18px]"}
              strokeWidth={1.8}
              aria-hidden
            />
          </span>
          <span>{triggerVariant === "desktop" ? "Report a bug or feedback" : "Feedback"}</span>
        </button>
      </DialogTrigger>

      <DialogContent
        dismissible={!isSubmitting}
        className="max-h-[min(92dvh,720px)] max-w-xl overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 pb-4 pt-5 sm:px-0 sm:pt-0">
          <div className="min-w-0">
            <DialogTitle className="text-xl">Report a bug or share feedback</DialogTitle>
            <DialogDescription className="mt-1 leading-6">
              Send a note directly to the NexusDash team. We’ll include your account
              and this page so the report has useful context.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              disabled={isSubmitting}
              aria-label="Close feedback form"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </DialogClose>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 pt-5 sm:px-0">
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">
              What would you like to share?
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: "bug",
                    label: "A bug",
                    description: "Something isn’t working",
                    icon: Bug,
                  },
                  {
                    value: "feedback",
                    label: "Feedback",
                    description: "An idea or suggestion",
                    icon: Lightbulb,
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = reportType === option.value;

                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/60"
                    )}
                  >
                    <input
                      type="radio"
                      name="reportType"
                      value={option.value}
                      checked={selected}
                      onChange={() => setReportType(option.value)}
                      disabled={isSubmitting}
                      className="sr-only"
                    />
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <div className="flex items-end justify-between gap-4">
              <label
                htmlFor={`product-feedback-message-${triggerVariant}`}
                className="text-sm font-semibold"
              >
                Your message
              </label>
              <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>
                {message.length}/{PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              id={`product-feedback-message-${triggerVariant}`}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (submissionState === "error") {
                  setSubmissionState("idle");
                  setErrorMessage(null);
                }
              }}
              minLength={PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH}
              maxLength={PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH}
              required
              disabled={isSubmitting}
              placeholder={
                reportType === "bug"
                  ? "What happened, and what did you expect instead?"
                  : "What would make NexusDash work better for you?"
              }
              aria-describedby={`product-feedback-help-${triggerVariant}${
                errorMessage ? ` product-feedback-error-${triggerVariant}` : ""
              }`}
              className="mt-2 min-h-36 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-base leading-6 text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p
              id={`product-feedback-help-${triggerVariant}`}
              className="mt-1.5 text-xs leading-5 text-muted-foreground"
            >
              Please don’t include passwords, API keys, or other secrets.
            </p>
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(event.target.checked)}
              disabled={isSubmitting}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium">Include diagnostics</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Browser, screen size, language, and time zone. No page content,
                cookies, or form data.
              </span>
            </span>
          </label>

          {errorMessage ? (
            <p
              id={`product-feedback-error-${triggerVariant}`}
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <button
                type="button"
                disabled={isSubmitting}
                className="min-h-11 rounded-lg border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  Send report
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
