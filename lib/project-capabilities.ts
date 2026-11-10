/** Shared human/agent vocabulary. Schedule is reserved; it grants no Google Calendar access. */
export const PROJECT_MODULES = [
  { id: "task", label: "Tasks" },
  { id: "meeting", label: "Meeting notes" },
  { id: "context", label: "Context cards" },
  { id: "epic", label: "Epics" },
  { id: "roadmap", label: "Roadmap" },
  { id: "schedule", label: "Shared schedule (coming later)" },
] as const;
export type ProjectModule = (typeof PROJECT_MODULES)[number]["id"];
export type ProjectCapability = `${ProjectModule}:${"read" | "write" | "delete"}`;
export const PROJECT_CAPABILITIES: readonly ProjectCapability[] = PROJECT_MODULES.flatMap(
  ({ id }) => [`${id}:read`, `${id}:write`, `${id}:delete`] as ProjectCapability[]
);
export type CapabilityRole = "owner" | "editor" | "viewer";

export function roleCapabilities(role: CapabilityRole): ProjectCapability[] {
  return PROJECT_CAPABILITIES.filter((capability) =>
    role === "owner" || capability.endsWith(":read") ||
    (role === "editor" && (capability.endsWith(":write") ||
      capability === "epic:delete" || capability === "meeting:delete" || capability === "roadmap:delete"))
  );
}

/** null means the legacy role preset; [] explicitly denies every module. */
export function effectiveProjectCapabilities(role: CapabilityRole, grants: unknown): ProjectCapability[] {
  const ceiling = roleCapabilities(role);
  if (role === "owner" || grants == null) return ceiling;
  if (!Array.isArray(grants)) return [];
  return ceiling.filter((capability) => grants.includes(capability));
}

export function isValidCapabilityGrant(value: unknown, role: CapabilityRole): boolean {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  const allowed = roleCapabilities(role);
  return value.every((entry) => typeof entry === "string" && allowed.includes(entry as ProjectCapability)) &&
    value.every((entry: string) => entry.endsWith(":read") || value.includes(`${entry.split(":")[0]}:read`));
}

export function describeProjectCapabilities(role: CapabilityRole, grants: unknown): string {
  const effective = effectiveProjectCapabilities(role, grants);
  const summaries = PROJECT_MODULES.filter(({ id }) => id !== "schedule").flatMap(({ id, label }) => {
    if (!effective.includes(`${id}:read`)) return [];
    return [`${label}: ${effective.includes(`${id}:delete`) ? "read, edit and delete" : effective.includes(`${id}:write`) ? "read and edit" : "read only"}`];
  });
  return summaries.length ? summaries.join("; ") : "No module access";
}
