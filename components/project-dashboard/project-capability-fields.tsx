"use client";

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
  return (
    <details className="w-full text-sm">
      <summary className="cursor-pointer rounded-sm py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">{label}</summary>
      <p className="mb-3 text-xs text-muted-foreground">Choose what this person can use. Assignment does not change access. The project role sets the maximum permissions.</p>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{label}</legend>
        {PROJECT_MODULES.filter(({ id }) => id !== "schedule").map(({ id, label: moduleLabel }) => {
          const level = grants.includes(`${id}:delete`) ? "delete" : grants.includes(`${id}:write`) ? "write" : grants.includes(`${id}:read`) ? "read" : "none";
          return (
            <label key={id} className="flex flex-col gap-1.5">
              <span>{moduleLabel}</span>
              <select aria-label={`${moduleLabel} access`} value={level} className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                onChange={(event) => {
                  const next = event.target.value;
                  const moduleGrants: ProjectCapability[] = next === "none" ? [] : [`${id}:read`];
                  if (next === "write" || next === "delete") moduleGrants.push(`${id}:write`);
                  if (next === "delete") moduleGrants.push(`${id}:delete`);
                  onChange([...grants.filter((grant) => !grant.startsWith(`${id}:`)), ...moduleGrants]);
                }}>
                <option value="none">No access</option>
                <option value="read">Read only</option>
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
