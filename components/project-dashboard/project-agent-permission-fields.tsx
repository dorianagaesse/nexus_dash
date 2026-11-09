"use client";

import { PROJECT_MODULES } from "@/lib/project-capabilities";
import type { AgentScope } from "@/lib/agent-access";

const actions = [{ id: "read", label: "Read" }, { id: "write", label: "Edit" }, { id: "delete", label: "Delete" }] as const;

/** One row per live module; independent grants stay independent when editing. */
export function ProjectAgentPermissionFields({ value, onChange, disabled = false }: {
  value: AgentScope[];
  onChange: (scopes: AgentScope[]) => void;
  disabled?: boolean;
}) {
  const toggle = (scope: AgentScope) => onChange(value.includes(scope) ? value.filter((entry) => entry !== scope) : [...value, scope]);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">Agent permissions</legend>
      <div className="overflow-hidden rounded-xl border border-border">
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_repeat(3,3rem)] items-center border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4">
          <span>Module</span>{actions.map((action) => <span key={action.id} className="text-center">{action.label}</span>)}
        </div>
        {PROJECT_MODULES.filter(({ id }) => id !== "schedule").map(({ id, label }) => (
          <div key={id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,3rem)] items-center border-b border-border/60 px-3 last:border-b-0 sm:px-4">
            <span className="py-3 text-sm font-medium">{label}</span>
            {actions.map((action) => {
              const scope: AgentScope = `${id}:${action.id}`;
              return <label key={action.id} className="flex min-h-11 cursor-pointer items-center justify-center rounded-md hover:bg-muted/50 has-[:disabled]:cursor-default">
                <input type="checkbox" value={scope} aria-label={`${label} ${action.label.toLowerCase()}`} checked={value.includes(scope)} onChange={() => toggle(scope)}
                  className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-50" />
              </label>;
            })}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {([
          ["project:read", "Project details", "Read the project name and permitted summary counts."],
          ["attention:read", "Mentions and assignments", "Read this agent's own mentions and assigned work."],
        ] as const).map(([scope, title, description]) => (
          <label key={scope} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2">
            <input type="checkbox" value={scope} checked={value.includes(scope)} onChange={() => toggle(scope)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-50" />
            <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
