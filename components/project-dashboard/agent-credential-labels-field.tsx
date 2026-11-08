"use client";

import { useState, type RefObject } from "react";
import { X } from "lucide-react";

import {
  AGENT_DESCRIPTIVE_LABELS_HINT,
  parseAgentCredentialDescriptiveLabels,
} from "@/lib/agent-credential-labels";
import { getTaskLabelColor } from "@/lib/task-label";

interface Props {
  id: string;
  label: string;
  labels: string[];
  onLabelsChange: (labels: string[]) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function AgentCredentialLabelsField({
  id, label, labels, onLabelsChange, draft, onDraftChange, error,
  onErrorChange, inputRef, disabled = false, autoFocus = false,
}: Props) {
  const [focused, setFocused] = useState(false);

  const addLabel = () => {
    if (!draft.trim()) {
      onDraftChange("");
      return;
    }
    const next = parseAgentCredentialDescriptiveLabels([...labels, draft]);
    if (!next) {
      onErrorChange(`${AGENT_DESCRIPTIVE_LABELS_HINT} Add one label at a time, without commas or control characters.`);
      return;
    }
    onLabelsChange(next);
    onDraftChange("");
    onErrorChange(null);
  };

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <div className="min-w-0 rounded-lg border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
        {labels.length ? (
          <ul aria-label="Added descriptive labels" className="mb-2 flex min-w-0 flex-wrap gap-2">
            {labels.map((entry) => (
              <li key={entry} className="inline-flex max-w-full items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium text-slate-900"
                style={{ backgroundColor: getTaskLabelColor(entry) }}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{entry}</span>
                <button type="button" disabled={disabled} aria-label={`Remove label ${entry}`}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-slate-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
                  onClick={() => {
                    onLabelsChange(labels.filter((value) => value !== entry));
                    onErrorChange(null);
                    inputRef.current?.focus();
                  }}>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input id={id} ref={inputRef} autoFocus={autoFocus} value={draft} disabled={disabled}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={Boolean(error) || undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(event) => { onDraftChange(event.target.value); onErrorChange(null); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              addLabel();
            }
          }}
          placeholder="e.g. GPT-6"
          className="h-9 w-full min-w-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p id={`${id}-hint`} className="min-h-4 text-xs text-muted-foreground">
        {focused && draft !== "" ? "Press Enter to add a label" : AGENT_DESCRIPTIVE_LABELS_HINT}
      </p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
