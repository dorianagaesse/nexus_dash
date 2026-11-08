"use client";

import { useRef, useState, type Ref } from "react";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import {
  AGENT_CREDENTIAL_PRESETS,
  AGENT_SCOPE_DEFINITIONS,
  DEFAULT_AGENT_CREDENTIAL_PRESET_ID,
  MAX_AGENT_CREDENTIAL_LABEL_LENGTH,
  resolveAgentCredentialPreset,
  type AgentScope,
} from "@/lib/agent-access";
import { Button } from "@/components/ui/button";
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
  const presetsRef = useRef<HTMLDivElement>(null);

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
          presetsRef.current?.focus();
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
          <div>
            <p className="text-sm font-medium">
              What should this agent be able to do?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a starting point. You can customize the individual
              permissions below.
            </p>
          </div>
          <div
            ref={presetsRef}
            role="group"
            aria-label="Scope presets"
            aria-describedby={formError?.field === "permissions" ? "project-agent-permissions-error" : undefined}
            tabIndex={-1}
            className="grid gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-2"
          >
            {AGENT_CREDENTIAL_PRESETS.map((preset) => {
              const selected =
                scopes.length === preset.scopes.length &&
                preset.scopes.every((scope) => scopes.includes(scope));
              return (
                <button
                  type="button"
                  key={preset.id}
                  aria-pressed={selected}
                  onClick={() => {
                    setScopes([...preset.scopes]);
                    setFormError((current) =>
                      current?.field === "permissions" ? null : current
                    );
                  }}
                  className={`min-w-0 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="flex items-start justify-between gap-2 text-sm font-medium">
                    <span>
                      {preset.label}
                      {preset.recommended ? (
                        <span className="mt-0.5 block text-xs font-normal text-primary">
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
          {formError?.field === "permissions" ? (
            <p id="project-agent-permissions-error" role="alert" className="text-sm text-destructive">
              {formError.message}
            </p>
          ) : null}
        </div>
        <details className="group rounded-xl border border-border/70">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Customize permissions{" "}
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              {scopes.length} selected
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </span>
          </summary>
          <div className="grid gap-2 border-t border-border/70 p-3 sm:grid-cols-2">
            {AGENT_SCOPE_DEFINITIONS.map((definition) => (
              <label
                key={definition.scope}
                className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  value={definition.scope}
                  checked={scopes.includes(definition.scope)}
                  onChange={() => {
                    setScopes((current) =>
                      current.includes(definition.scope)
                        ? current.filter((scope) => scope !== definition.scope)
                        : [...current, definition.scope]
                    );
                    setFormError((current) =>
                      current?.field === "permissions" ? null : current
                    );
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 text-xs">
                  <span className="block font-medium">{definition.label}</span>
                  <span className="mt-1 block leading-relaxed text-muted-foreground">
                    {definition.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </details>
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
