"use client";

import { ChevronDown } from "lucide-react";
import { PROJECT_MODULES, effectiveProjectCapabilities, roleCapabilities, type CapabilityRole, type ProjectCapability } from "@/lib/project-capabilities";

export function ProjectCapabilityFields({ role, value, onChange, disabled = false, label = "Module access" }: {
  role: CapabilityRole;
  value?: ProjectCapability[] | null;
  onChange: (value: ProjectCapability[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const grants = effectiveProjectCapabilities(role, value);
  const ceiling = roleCapabilities(role);
  const modules = PROJECT_MODULES.filter(({ id }) => id !== "schedule");
  const readable = modules.filter(({ id }) => grants.includes(`${id}:read`)).length;
  return (
    <details className="group w-full min-w-0 border-t border-border/60 pt-2 text-sm">
      <summary aria-label={label} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="font-medium">Module access</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">{readable} of {modules.length} modules<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{role === "viewer" ? "Viewers can read selected modules. Choose Editor above to allow changes." : "Choose what this person can view or change in each module."}</p>
      <fieldset disabled={disabled} className="min-w-0 overflow-hidden rounded-xl border border-border">
        <legend className="sr-only">{label}</legend>
        {modules.map(({ id, label: moduleLabel }) => {
          const level = grants.includes(`${id}:delete`) ? "delete" : grants.includes(`${id}:write`) ? "write" : grants.includes(`${id}:read`) ? "read" : "none";
          return (
            <label key={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_240px] sm:px-4">
              <span className="font-medium">{moduleLabel}</span>
              <select aria-label={`${moduleLabel} access`} value={level} className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                onChange={(event) => {
                  const next = event.target.value;
                  const moduleGrants: ProjectCapability[] = next === "none" ? [] : [`${id}:read`];
                  if (next === "write" || next === "delete") moduleGrants.push(`${id}:write`);
                  if (next === "delete") moduleGrants.push(`${id}:delete`);
                  onChange([...grants.filter((grant) => !grant.startsWith(`${id}:`)), ...moduleGrants]);
                }}>
                <option value="none">No access</option><option value="read">Read only</option>
                {ceiling.includes(`${id}:write`) && <option value="write">Read and edit</option>}
                {ceiling.includes(`${id}:delete`) && <option value="delete">Read, edit and delete</option>}
              </select>
            </label>
          );
        })}
      </fieldset>
    </details>
  );
}
