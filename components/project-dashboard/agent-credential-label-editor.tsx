"use client";

import { useRef, useState } from "react";

import {
  AGENT_DESCRIPTIVE_LABELS_HINT,
  AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR,
  parseAgentCredentialDescriptiveLabels,
} from "@/lib/agent-credential-labels";
import { Button } from "@/components/ui/button";
import { AgentCredentialLabelsField } from "./agent-credential-labels-field";
import { AgentCredentialDescriptiveLabels } from "@/components/agent-credential-descriptive-labels";

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
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = `credential-labels-${credentialId}`;

  if (!isEditing) {
    return (
      <div className="min-w-0 space-y-3">
        <AgentCredentialDescriptiveLabels labels={labels} />
        <Button ref={triggerRef} type="button" variant="outline" size="sm" disabled={disabled}
          aria-label={`Edit descriptive labels for ${name}`}
          onClick={() => {
            setDraftLabels([...(labels ?? [])]);
            setDraft("");
            setError(null);
            setIsEditing(true);
          }}>
          Edit labels
        </Button>
      </div>
    );
  }

  const save = async () => {
    const parsed = parseAgentCredentialDescriptiveLabels(draftLabels);
    if (draft.trim() || !parsed) {
      setError(draft.trim() ? AGENT_DESCRIPTIVE_LABEL_PENDING_ERROR : AGENT_DESCRIPTIVE_LABELS_HINT);
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
      <AgentCredentialLabelsField
        id={id} label={`Descriptive labels for ${name}`} inputRef={inputRef} autoFocus
        labels={draftLabels} onLabelsChange={setDraftLabels}
        draft={draft} onDraftChange={setDraft} error={error} onErrorChange={setError}
        disabled={disabled || isSaving}
      />
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
