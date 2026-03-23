export type ProjectCollaboratorRole = "editor" | "viewer";
export type ProjectDashboardSettingsTab = "general" | "sharing";

export interface CollaboratorIdentitySummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  email: string | null;
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
