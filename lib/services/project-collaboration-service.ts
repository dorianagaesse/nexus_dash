// Public collaboration facade. Keep callers independent of internal use-case ownership.

export type {
  ProjectCollaboratorRole,
  CollaboratorIdentitySummary,
  ProjectMemberSummary,
  ProjectInvitationSummary,
  ProjectInvitationEmailDeliveryError,
  ProjectInvitationEmailDeliverySummary,
  ProjectSharingSummary,
  ProjectInvitationRecipientState,
  ProjectInvitationRecipientView,
} from "./collaboration/collaboration-types";

export { buildProjectInvitationReturnToPath } from "./collaboration/collaboration-policy";

export {
  searchInvitableUsersForProject,
  inviteUserToProject,
  sendProjectInvitationEmailForOwner,
  revokeProjectInvitation,
} from "./collaboration/owner-invitations";

export {
  getProjectSharingSummary,
  updateProjectMemberRole,
  removeProjectMember,
  getProjectRoleForActor,
  canManageProjectCollaboration,
  canEditProjectContent,
  searchProjectMembersForMention,
} from "./collaboration/project-membership";

export {
  listPendingProjectInvitationsForUser,
  countPendingProjectInvitationsForUser,
  respondToProjectInvitation,
  getProjectInvitationRecipientView,
} from "./collaboration/recipient-invitations";
