// Shared collaboration result and projection contracts.

import type { ProjectMembershipRole } from "@prisma/client";
import {
  type ProjectResponsibilityInventory,
} from "@/lib/services/project-offboarding-service";

export type ProjectCollaboratorRole = Exclude<ProjectMembershipRole, "owner">;

export interface ServiceError {
  ok: false;
  status: number;
  error: string;
  inventory?: ProjectResponsibilityInventory;
}

export interface ServiceSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface CollaboratorIdentitySummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  email: string | null;
  avatarSeed: string;
}

export interface ProjectMemberSummary extends CollaboratorIdentitySummary {
  membershipId: string;
  role: ProjectMembershipRole;
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

export type ProjectInvitationEmailDeliveryError =
  | "invalid-recipient"
  | "delivery-record-failed"
  | "provider-unavailable"
  | "provider-rejected"
  | "invite-url-unavailable";

export interface ProjectInvitationEmailDeliverySummary {
  status: "sent" | "skipped" | "failed";
  deliveryId: string | null;
  provider: "resend";
  providerMessageId: string | null;
  providerStatus: number | null;
  error: ProjectInvitationEmailDeliveryError | null;
}

export interface ProjectSharingSummary {
  projectId: string;
  members: ProjectMemberSummary[];
  pendingInvitations: ProjectInvitationSummary[];
}

export type ProjectInvitationRecipientState =
  | "not-found"
  | "revoked"
  | "expired"
  | "replaced"
  | "accepted"
  | "sign-in-required"
  | "wrong-account"
  | "verification-required"
  | "accept-ready";

export interface ProjectInvitationRecipientView {
  state: ProjectInvitationRecipientState;
  invitation: ProjectInvitationSummary | null;
  actor: CollaboratorIdentitySummary | null;
  actorEmailVerified: boolean;
  actorEmailMatchesInvitation: boolean;
}

export interface PendingInvitationMetadataRow {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedByUserId: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
  invitationRole: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
}

export interface InvitationMatchedUser {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
}

export interface InvitationRecipientLookupRow {
  invitationId: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitationRole: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  replacedAt: Date | null;
  invitedByUserId: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  invitedByUsername: string | null;
  invitedByUsernameDiscriminator: string | null;
}

export interface ProjectInvitationRecord {
  id: string;
  projectId: string;
  invitedEmail: string;
  role: ProjectMembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  replacedAt: Date | null;
  project: {
    id: string;
    name: string;
  };
  invitedByUser: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
  };
}
