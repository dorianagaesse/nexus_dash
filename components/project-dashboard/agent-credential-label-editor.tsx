"use client";

import { useRef, useState } from "react";

import {
  AGENT_DESCRIPTIVE_LABELS_HINT,
  parseAgentCredentialDescriptiveLabelsDraft,
} from "@/lib/agent-credential-labels";
import { Button } from "@/components/ui/button";

export function AgentCredentialLabelEditor({
  credentialId, name, labels, disabled, onSave,
}: {
  credentialId: string;
  name: string;
  labels?: string[];
  disabled: boolean;
  onSave: (labels: string[]) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = `credential-labels-${credentialId}`;

  if (!isEditing) {
    return (
      <Button ref={triggerRef} type="button" variant="outline" size="sm" disabled={disabled}
        aria-label={`Edit descriptive labels for ${name}`}
        onClick={() => {
          setDraft((labels ?? []).join(", "));
          setError(null);
          setIsEditing(true);
        }}>
        Edit labels
      </Button>
    );
  }

  const save = async () => {
    const parsed = parseAgentCredentialDescriptiveLabelsDraft(draft);
    if (!parsed) {
      setError(AGENT_DESCRIPTIVE_LABELS_HINT + " Labels must be non-empty text.");
      inputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      if (await onSave(parsed)) {
        setIsEditing(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      else setError("Could not save labels. Please retry.");
    } catch {
      setError("Could not save labels. Please retry.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">Descriptive labels for {name}</label>
      <input ref={inputRef} id={id} autoFocus value={draft} disabled={disabled || isSaving}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => { setDraft(event.target.value); setError(null); }}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{AGENT_DESCRIPTIVE_LABELS_HINT} Leave empty to remove all labels.</p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={disabled || isSaving} onClick={() => void save()}>{isSaving ? "Saving labels..." : "Save labels"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={() => {
          setIsEditing(false);
          requestAnimationFrame(() => triggerRef.current?.focus());
        }}>Cancel</Button>
      </div>
    </div>
  );
}
