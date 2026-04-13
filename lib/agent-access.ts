export const AGENT_SCOPE_VALUES = [
  "project:read",
  "task:read",
  "task:write",
  "task:delete",
  "context:read",
  "context:write",
  "context:delete",
] as const;

export type AgentScope = (typeof AGENT_SCOPE_VALUES)[number];

export type AgentCredentialStatus = "active" | "expired" | "revoked";
export type AgentAuditAction =
  | "credential_created"
  | "credential_rotated"
  | "credential_revoked"
  | "token_exchanged"
  | "token_exchange_failed"
  | "request_used";

export const MAX_AGENT_CREDENTIAL_LABEL_LENGTH = 80;
export const AGENT_API_KEY_PUBLIC_ID_PREFIX = "nda_";

export interface AgentScopeDefinition {
  scope: AgentScope;
  label: string;
  description: string;
}

export const AGENT_SCOPE_DEFINITIONS: ReadonlyArray<AgentScopeDefinition> = [
  {
    scope: "project:read",
    label: "Project Read",
    description: "Read project metadata and summary metrics.",
  },
  {
    scope: "task:read",
    label: "Task Read",
    description: "List and inspect project tasks.",
  },
  {
    scope: "task:write",
    label: "Task Write",
    description: "Create, update, reorder, archive, and unarchive tasks.",
  },
  {
    scope: "task:delete",
    label: "Task Delete",
    description: "Delete project tasks.",
  },
  {
    scope: "context:read",
    label: "Context Read",
    description: "List and inspect project context cards.",
  },
  {
    scope: "context:write",
    label: "Context Write",
    description: "Create and update project context cards.",
  },
  {
    scope: "context:delete",
    label: "Context Delete",
    description: "Delete project context cards.",
  },
];

function normalizeScope(value: unknown): AgentScope | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim() as AgentScope;
  return AGENT_SCOPE_VALUES.includes(trimmedValue) ? trimmedValue : null;
}

export function parseAgentScopes(value: unknown): AgentScope[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<AgentScope>();
  const scopes: AgentScope[] = [];

  for (const entry of value) {
    const scope = normalizeScope(entry);
    if (!scope || seen.has(scope)) {
      continue;
    }

    seen.add(scope);
    scopes.push(scope);
  }

  return scopes.sort(
    (left, right) => AGENT_SCOPE_VALUES.indexOf(left) - AGENT_SCOPE_VALUES.indexOf(right)
  );
}

export function normalizeAgentCredentialLabel(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function isValidAgentCredentialLabel(label: string): boolean {
  return label.length >= 2 && label.length <= MAX_AGENT_CREDENTIAL_LABEL_LENGTH;
}

export function buildRawAgentApiKey(input: {
  publicId: string;
  secret: string;
}): string {
  return `${input.publicId}.${input.secret}`;
}

export function parseRawAgentApiKey(
  value: string | null | undefined
): {
  publicId: string;
  secret: string;
} | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  const separatorIndex = trimmedValue.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex >= trimmedValue.length - 1) {
    return null;
  }

  const publicId = trimmedValue.slice(0, separatorIndex).trim();
  const secret = trimmedValue.slice(separatorIndex + 1).trim();

  if (!publicId.startsWith(AGENT_API_KEY_PUBLIC_ID_PREFIX) || !secret) {
    return null;
  }

  return {
    publicId,
    secret,
  };
}

export function resolveAgentCredentialStatus(input: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  now?: Date;
}): AgentCredentialStatus {
  if (input.revokedAt) {
    return "revoked";
  }

  const now = input.now ?? new Date();
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  return "active";
}

export function hasAgentScopes(
  scopes: readonly AgentScope[],
  requiredScopes: readonly AgentScope[]
): boolean {
  const scopeSet = new Set(scopes);
  return requiredScopes.every((scope) => scopeSet.has(scope));
}
