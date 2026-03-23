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
  invitedUserId: string;
  invitedUserDisplayName: string;
  invitedUserUsernameTag: string | null;
  invitedUserEmail: string | null;
  invitedByDisplayName: string;
  invitedByUsernameTag: string | null;
  invitedByEmail: string | null;
  role: ProjectCollaboratorRole;
  createdAt: string;
  expiresAt: string;
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
    case "invitee-not-found":
      return "Select an existing verified NexusDash user.";
    case "already-a-member":
      return "That user is already a collaborator on this project.";
    case "invitation-already-pending":
      return "That user already has a pending invitation.";
    case "cannot-invite-self":
      return "You already own this project.";
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
