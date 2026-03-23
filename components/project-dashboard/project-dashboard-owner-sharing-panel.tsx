"use client";

import { Search, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  buildRoleSummary,
  formatIdentity,
  ROLE_COPY,
  type CollaboratorIdentitySummary,
  type ProjectCollaboratorRole,
  type ProjectInvitationSummary,
  type ProjectMemberSummary,
  type ProjectSharingSummary,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

interface ProjectDashboardOwnerSharingPanelProps {
  inviteQuery: string;
  inviteEmailCandidate: string | null;
  inviteRole: ProjectCollaboratorRole;
  inviteResults: CollaboratorIdentitySummary[];
  isSearchingUsers: boolean;
  isInvitingUserId: string | null;
  isLoadingSharing: boolean;
  sharingError: string | null;
  sharingSummary: ProjectSharingSummary | null;
  searchMessage: string | null;
  isMutatingMemberId: string | null;
  isMutatingInvitationId: string | null;
  onInviteQueryChange: (value: string) => void;
  onInviteRoleChange: (role: ProjectCollaboratorRole) => void;
  onInviteByEmail: (email: string) => void;
  onInvite: (user: CollaboratorIdentitySummary) => void;
  onRoleChange: (member: ProjectMemberSummary, nextRole: ProjectCollaboratorRole) => void;
  onRemoveMember: (member: ProjectMemberSummary) => void;
  onCopyInvitationLink: (invitation: ProjectInvitationSummary) => void;
  onRevokeInvitation: (invitation: ProjectInvitationSummary) => void;
}

export function ProjectDashboardOwnerSharingPanel({
  inviteQuery,
  inviteEmailCandidate,
  inviteRole,
  inviteResults,
  isSearchingUsers,
  isInvitingUserId,
  isLoadingSharing,
  sharingError,
  sharingSummary,
  searchMessage,
  isMutatingMemberId,
  isMutatingInvitationId,
  onInviteQueryChange,
  onInviteRoleChange,
  onInviteByEmail,
  onInvite,
  onRoleChange,
  onRemoveMember,
  onCopyInvitationLink,
  onRevokeInvitation,
}: ProjectDashboardOwnerSharingPanelProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Invite collaborator</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Search existing verified users or enter an email address to create an invite
            link.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="grid gap-2">
            <label htmlFor="project-sharing-search" className="text-sm font-medium">
              Search user or enter email
            </label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                id="project-sharing-search"
                value={inviteQuery}
                onChange={(event) => onInviteQueryChange(event.target.value)}
                placeholder="Search by email, name, or username"
                className="h-10 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="project-sharing-role" className="text-sm font-medium">
              Invite role
            </label>
            <select
              id="project-sharing-role"
              value={inviteRole}
              onChange={(event) =>
                onInviteRoleChange(event.target.value as ProjectCollaboratorRole)
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="editor">Editor (default)</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{ROLE_COPY[inviteRole]}</p>

        <div className="space-y-2">
          {inviteEmailCandidate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{inviteEmailCandidate}</p>
                <p className="text-xs text-muted-foreground">
                  Create an email-bound invitation link for this address.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => onInviteByEmail(inviteEmailCandidate)}
                disabled={isInvitingUserId === inviteEmailCandidate}
              >
                {isInvitingUserId === inviteEmailCandidate ? "Creating..." : "Invite by email"}
              </Button>
            </div>
          ) : null}

          {isSearchingUsers ? (
            <p className="text-sm text-muted-foreground">Searching users...</p>
          ) : null}

          {!isSearchingUsers && inviteResults.length > 0 ? (
            <div className="space-y-2">
              {inviteResults.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground">{formatIdentity(user)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onInvite(user)}
                    disabled={isInvitingUserId === user.id}
                  >
                    {isInvitingUserId === user.id ? "Inviting..." : "Invite"}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {!isSearchingUsers && searchMessage ? (
            <p className="text-sm text-muted-foreground">{searchMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Collaborators</h3>
          <p className="text-sm text-muted-foreground">
            Owners manage who can edit or view the project in v1.
          </p>
        </div>

        {isLoadingSharing ? (
          <p className="text-sm text-muted-foreground">Loading collaborators...</p>
        ) : null}

        {!isLoadingSharing && sharingError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sharingError}
          </div>
        ) : null}

        {!isLoadingSharing && sharingSummary ? (
          <div className="space-y-3">
            {sharingSummary.members.map((member) => (
              <div
                key={member.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{member.displayName}</p>
                    <Badge
                      variant={member.isOwner ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {member.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatIdentity(member)}</p>
                </div>

                {member.isOwner ? (
                  <p className="text-xs text-muted-foreground">Project owner</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(event) =>
                        onRoleChange(member, event.target.value as ProjectCollaboratorRole)
                      }
                      disabled={isMutatingMemberId === member.membershipId}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveMember(member)}
                      disabled={isMutatingMemberId === member.membershipId}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Pending invitations</h3>
          <p className="text-sm text-muted-foreground">
            Invitations stay visible here until they are accepted, declined, or revoked.
          </p>
        </div>

        {sharingSummary && sharingSummary.pendingInvitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : null}

        {sharingSummary && sharingSummary.pendingInvitations.length > 0 ? (
          <div className="space-y-3">
            {sharingSummary.pendingInvitations.map((invitation) => (
              <div
                key={invitation.invitationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {invitation.invitedUserDisplayName ?? invitation.invitedEmail}
                    </p>
                    <Badge variant="outline" className="capitalize">
                      {invitation.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {invitation.invitedUserDisplayName
                      ? formatIdentity({
                          id: invitation.invitedUserId ?? invitation.invitedEmail,
                          displayName: invitation.invitedUserDisplayName,
                          usernameTag: invitation.invitedUserUsernameTag,
                          email: invitation.invitedEmail,
                        })
                      : invitation.invitedEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {buildRoleSummary(invitation.role)}. Expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onCopyInvitationLink(invitation)}
                  >
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRevokeInvitation(invitation)}
                    disabled={isMutatingInvitationId === invitation.invitationId}
                  >
                    {isMutatingInvitationId === invitation.invitationId
                      ? "Revoking..."
                      : "Revoke"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
