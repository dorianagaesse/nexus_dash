import { AGENT_CREDENTIAL_PRESETS, type AgentScope } from "@/lib/agent-access";

const RESOURCE_NAMES = {
  project: "Project details",
  task: "Tasks",
  context: "Context cards",
  roadmap: "Roadmap",
  attention: "Mentions & assignments",
} as const;

export function describeAgentAccess(scopes: AgentScope[]): string {
  const preset = AGENT_CREDENTIAL_PRESETS.find(
    (entry) =>
      entry.scopes.length === scopes.length &&
      entry.scopes.every((scope) => scopes.includes(scope))
  );
  switch (preset?.id) {
    case "read-only":
      return "Read only";
    case "read-write":
      return "Read & write";
    case "full-access":
      return "Full task access";
    case "attention-read":
      return "Mentions & assignments";
    default:
      return "Custom access";
  }
}

export function describeAgentResources(scopes: AgentScope[]) {
  return Object.entries(RESOURCE_NAMES).flatMap(([resource, name]) => {
    const actions = scopes
      .filter((scope) => scope.startsWith(`${resource}:`))
      .map((scope) => {
        switch (scope.split(":")[1]) {
          case "read":
            return "View";
          case "write":
            return "Edit";
          default:
            return "Delete";
        }
      });
    return actions.length ? [{ name, actions: actions.join(", ") }] : [];
  });
}

export function formatAgentDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";
}
