import type {
  AgentAuditAction,
  AgentCredentialStatus,
  AgentScope,
} from "@/lib/agent-access";

export type ProjectCollaboratorRole = "editor" | "viewer";
export type ProjectDashboardSettingsTab =
  | "general"
  | "sharing"
  | "access"
  | "agents";

export interface CollaboratorIdentitySummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  email: string | null;
  avatarSeed: string;
}

export interface ProjectMemberSummary extends CollaboratorIdentitySummary {
  membershipId: string;
  role: "owner" | ProjectCollaboratorRole;
  joinedAt: string;
  isOwner: boolean;
}

export interface ProjectInvitationSummary {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedUserId: string | null;
  invitedUserDisplayName: string | null;
  invitedUserUsernameTag: string | null;
  invitedByDisplayName: string;
  invitedByUsernameTag: string | null;
  invitedByEmail: string | null;
  role: ProjectCollaboratorRole;
  createdAt: string;
  expiresAt: string;
  inviteLinkPath: string;
}

export interface ProjectSharingSummary {
  projectId: string;
  members: ProjectMemberSummary[];
  pendingInvitations: ProjectInvitationSummary[];
}

export interface ProjectAgentCredentialSummary {
  id: string;
  label: string;
  publicId: string;
  scopes: AgentScope[];
  status: AgentCredentialStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastExchangedAt: string | null;
  lastRotatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentAuditEventSummary {
  id: string;
  action: AgentAuditAction;
  credentialId: string | null;
  credentialLabel: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  path: string | null;
  createdAt: string;
}

export interface ProjectAgentAccessSummary {
  projectId: string;
  accessTokenTtlSeconds: number;
  credentials: ProjectAgentCredentialSummary[];
  recentEvents: ProjectAgentAuditEventSummary[];
}

export interface ProjectAgentCredentialIssuedSecret {
  credential: ProjectAgentCredentialSummary;
  apiKey: string;
  accessTokenTtlSeconds: number;
}

export interface GeneratedProjectInvitationLink {
  invitation: ProjectInvitationSummary;
  url: string;
}

export const ROLE_COPY: Record<ProjectCollaboratorRole, string> = {
  editor: "Can collaborate and edit project content.",
  viewer: "Can view project content without editing.",
};

export function formatIdentity(summary: CollaboratorIdentitySummary): string {
  return summary.usernameTag ?? summary.email ?? summary.displayName;
}

export function mapProjectMutationError(errorCode: string): string {
  switch (errorCode) {
    case "name-too-short":
      return "Project name must be at least 2 characters long.";
    case "project-not-found":
      return "Project not found.";
    case "forbidden":
      return "Only the project owner can manage these settings.";
    default:
      return "Could not save project settings. Please retry.";
  }
}

export function mapSharingError(errorCode: string): string {
  switch (errorCode) {
    case "invalid-email":
      return "Enter a valid email address.";
    case "already-a-member":
      return "That email already belongs to a collaborator on this project.";
    case "cannot-invite-self":
      return "You already own this project.";
    case "invitation-conflict":
      return "A newer invitation was created at the same time. Refresh and retry if needed.";
    case "member-not-found":
      return "Collaborator not found.";
    case "cannot-change-owner-role":
      return "The owner role cannot be changed in v1.";
    case "cannot-remove-owner":
      return "The owner cannot be removed from the project.";
    case "invitation-not-found":
      return "Invitation not found.";
    case "forbidden":
      return "Only the project owner can manage sharing.";
    default:
      return "Could not update project sharing. Please retry.";
  }
}

export function buildRoleSummary(role: ProjectCollaboratorRole): string {
  return role === "editor"
    ? "Invited to collaborate on this project"
    : "Invited to view this project";
}

export function mapAgentAccessError(errorCode: string): string {
  switch (errorCode) {
    case "invalid-json":
      return "The request payload was invalid. Refresh and retry.";
    case "invalid-label":
      return "Credential label must be between 2 and 80 characters.";
    case "scopes-required":
      return "Select at least one agent scope.";
    case "invalid-expiry":
      return "Expiry must be between 1 and 365 days, or left empty.";
    case "credential-required":
      return "Credential id is required.";
    case "credential-not-found":
      return "Credential not found.";
    case "credential-revoked":
      return "Revoked credentials cannot be rotated.";
    case "credential-expired":
      return "Expired credentials must be recreated.";
    case "project-not-found":
      return "Project not found.";
    case "forbidden":
      return "Only the project owner can manage agent access.";
    case "unauthorized":
      return "Sign in again to continue.";
    default:
      return "Could not update agent access. Please retry.";
  }
}

export function formatAgentCredentialStatus(status: AgentCredentialStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    default:
      return status;
  }
}

export function formatAgentAuditAction(action: AgentAuditAction): string {
  switch (action) {
    case "credential_created":
      return "Credential created";
    case "credential_rotated":
      return "Credential rotated";
    case "credential_revoked":
      return "Credential revoked";
    case "token_exchanged":
      return "Token exchanged";
    case "token_exchange_failed":
      return "Token exchange failed";
    case "request_used":
      return "Request used";
    default:
      return action;
  }
}
