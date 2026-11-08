"use client";

import { useState, type Ref } from "react";
import { ShieldCheck } from "lucide-react";
import {
  AGENT_CREDENTIAL_PRESETS,
  DEFAULT_AGENT_CREDENTIAL_PRESET_ID,
  MAX_AGENT_CREDENTIAL_LABEL_LENGTH,
  resolveAgentCredentialPreset,
  type AgentScope,
} from "@/lib/agent-access";
import { Button } from "@/components/ui/button";
import { ProjectAgentPermissionFields } from "./project-agent-permission-fields";
import { describeAgentAccess } from "./project-agent-access-presentation";

export interface CreateProjectAgentCredentialInput {
  label: string;
  scopes: AgentScope[];
  expiresInDays: number | null;
}

interface ProjectAgentCredentialFormProps {
  inputRef?: Ref<HTMLInputElement>;
  isCreating: boolean;
  error: string | null;
  onCreate: (input: CreateProjectAgentCredentialInput) => void;
  onCancel: () => void;
}

export function ProjectAgentCredentialForm({
  inputRef,
  isCreating,
  error,
  onCreate,
  onCancel,
}: ProjectAgentCredentialFormProps) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>(() => [
    ...resolveAgentCredentialPreset(DEFAULT_AGENT_CREDENTIAL_PRESET_ID)!.scopes,
  ]);
  const [formError, setFormError] = useState<{
    field: "name" | "permissions";
    message: string;
  } | null>(null);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const label = name.trim();
        if (
          label.length < 2 ||
          label.length > MAX_AGENT_CREDENTIAL_LABEL_LENGTH
        ) {
          setFormError({
            field: "name",
            message: "Agent name must be between 2 and 80 characters.",
          });
          (
            event.currentTarget.elements.namedItem(
              "project-agent-label"
            ) as HTMLInputElement
          ).focus();
          return;
        }
        if (!scopes.length) {
          setFormError({
            field: "permissions",
            message: "Choose a preset or select at least one permission below.",
          });
          (event.currentTarget.elements.namedItem("project-agent-preset") as HTMLSelectElement).focus();
          return;
        }
        setFormError(null);
        onCreate({
          label,
          scopes,
          expiresInDays: expiry ? Number(expiry) : null,
        });
      }}
    >
      <fieldset disabled={isCreating} className="min-w-0 space-y-6">
        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div className="min-w-0 space-y-2">
            <label
              htmlFor="project-agent-label"
              className="text-sm font-medium"
            >
              Agent name
            </label>
            <input
              id="project-agent-label"
              ref={inputRef}
              aria-invalid={formError?.field === "name" || undefined}
              aria-describedby={`project-agent-name-hint${formError?.field === "name" ? " project-agent-name-error" : ""}`}
              value={name}
              maxLength={MAX_AGENT_CREDENTIAL_LABEL_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
                setFormError((current) =>
                  current?.field === "name" ? null : current
                );
              }}
              placeholder="e.g. Release assistant"
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id="project-agent-name-hint" className="text-xs text-muted-foreground">
              The name you’ll recognize in tasks and comments.
            </p>
            {formError?.field === "name" ? (
              <p id="project-agent-name-error" role="alert" className="text-sm text-destructive">
                {formError.message}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2">
            <label
              htmlFor="project-agent-expiry"
              className="text-sm font-medium"
            >
              Credential expiry
            </label>
            <select
              id="project-agent-expiry"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No expiry</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
        </div>
        <div className="space-y-3">
          <label htmlFor="project-agent-preset" className="block text-sm font-medium">Starting permissions</label>
          <select id="project-agent-preset" aria-invalid={formError?.field === "permissions" || undefined} aria-describedby={`project-agent-preset-hint${formError?.field === "permissions" ? " project-agent-permissions-error" : ""}`} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={AGENT_CREDENTIAL_PRESETS.find((preset) => scopes.length === preset.scopes.length && preset.scopes.every((scope) => scopes.includes(scope)))?.id ?? "custom"}
            onChange={(event) => { const preset = resolveAgentCredentialPreset(event.target.value); if (preset) { setScopes([...preset.scopes]); setFormError(null); } }}>
            <option value="custom" disabled>Custom permissions</option>
            {AGENT_CREDENTIAL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.id === "full-access" ? "Tasks: read, edit and delete" : preset.id === "read-write" ? "Tasks: read and edit" : preset.id === "read-only" ? "Tasks: read only" : preset.label}</option>)}
          </select>
          <p id="project-agent-preset-hint" className="text-xs leading-relaxed text-muted-foreground">Start with task access, then choose other modules below.</p>
          {formError?.field === "permissions" && <p id="project-agent-permissions-error" role="alert" className="text-sm text-destructive">{formError.message}</p>}
        </div>
        <div className="space-y-3">
          <div><h4 className="text-sm font-medium">Module permissions</h4><p className="mt-1 text-xs text-muted-foreground">Edit allows creating and updating. Delete is granted separately.</p></div>
          <ProjectAgentPermissionFields value={scopes} onChange={(next) => { setScopes(next); setFormError(null); }} />
        </div>
      </fieldset>
      <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          {describeAgentAccess(scopes)} access to this project. Completing tasks
          is off by default; you can grant it separately for this agent.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          aria-label="Credential creation error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isCreating}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isCreating}>
          {isCreating ? "Creating..." : "Create credential"}
        </Button>
      </div>
    </form>
  );
}
