"use client";

import { useState } from "react";

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
  const id = `credential-labels-${credentialId}`;

  if (!isEditing) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled}
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
      return;
    }
    setIsSaving(true);
    try {
      if (await onSave(parsed)) setIsEditing(false);
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
      <input id={id} autoFocus value={draft} disabled={disabled || isSaving}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => { setDraft(event.target.value); setError(null); }}
        className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{AGENT_DESCRIPTIVE_LABELS_HINT} Leave empty to remove all labels.</p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={disabled || isSaving} onClick={() => void save()}>{isSaving ? "Saving labels..." : "Save labels"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={() => setIsEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}
