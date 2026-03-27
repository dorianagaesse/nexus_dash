"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  formatIdentity,
  type GeneratedProjectInvitationLink,
  type ProjectCollaboratorRole,
  type ProjectInvitationSummary,
  type ProjectMemberSummary,
  type ProjectSharingSummary,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

interface ProjectDashboardOwnerAccessPanelProps {
  inviteEmailCandidate: string | null;
  generatedInvitationLink: GeneratedProjectInvitationLink | null;
  isLoadingSharing: boolean;
  sharingError: string | null;
  sharingSummary: ProjectSharingSummary | null;
  isMutatingMemberId: string | null;
  isMutatingInvitationId: string | null;
  onRoleChange: (member: ProjectMemberSummary, nextRole: ProjectCollaboratorRole) => void;
  onRemoveMember: (member: ProjectMemberSummary) => void;
  onCopyInvitationLink: (invitation: ProjectInvitationSummary) => Promise<boolean> | boolean;
  onRevokeInvitation: (invitation: ProjectInvitationSummary) => void;
}

function getSecondaryIdentity(primaryLabel: string, identityLabel: string): string | null {
  return identityLabel === primaryLabel ? null : identityLabel;
}

export function ProjectDashboardOwnerAccessPanel({
  inviteEmailCandidate,
  generatedInvitationLink,
  isLoadingSharing,
  sharingError,
  sharingSummary,
  isMutatingMemberId,
  isMutatingInvitationId,
  onRoleChange,
  onRemoveMember,
  onCopyInvitationLink,
  onRevokeInvitation,
}: ProjectDashboardOwnerAccessPanelProps) {
  const isShowingGeneratedInvitationLink =
    generatedInvitationLink?.invitation.invitedEmail === inviteEmailCandidate;

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Access</h3>
          <p className="text-sm text-muted-foreground">Manage collaborators and pending invites.</p>
        </div>
        {sharingSummary ? (
          <p className="text-xs text-muted-foreground">
            {sharingSummary.members.length + sharingSummary.pendingInvitations.length} total
          </p>
        ) : null}
      </div>

      {isLoadingSharing ? (
        <p className="text-sm text-muted-foreground">Loading access...</p>
      ) : null}

      {!isLoadingSharing && sharingError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sharingError}
        </div>
      ) : null}

      {!isLoadingSharing && sharingSummary ? (
        <>
          {sharingSummary.members.length === 1 &&
          sharingSummary.pendingInvitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Only you have access right now.</p>
          ) : null}

          {sharingSummary.members.length > 0 || sharingSummary.pendingInvitations.length > 0 ? (
            <div className="space-y-2">
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
                    {getSecondaryIdentity(member.displayName, formatIdentity(member)) ? (
                      <p className="text-xs text-muted-foreground">
                        {getSecondaryIdentity(member.displayName, formatIdentity(member))}
                      </p>
                    ) : null}
                  </div>

                  {member.isOwner ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(event) =>
                          onRoleChange(
                            member,
                            event.target.value as ProjectCollaboratorRole
                          )
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

              {sharingSummary.pendingInvitations.map((invitation) => {
                const invitationLabel =
                  invitation.invitedUserDisplayName ?? invitation.invitedEmail;
                const invitationIdentity = invitation.invitedUserDisplayName
                  ? formatIdentity({
                      id: invitation.invitedUserId ?? invitation.invitedEmail,
                      displayName: invitation.invitedUserDisplayName,
                      usernameTag: invitation.invitedUserUsernameTag,
                      email: invitation.invitedEmail,
                    })
                  : invitation.invitedEmail;
                const secondaryIdentity = getSecondaryIdentity(
                  invitationLabel,
                  invitationIdentity
                );
                const isGeneratedInvitationActive =
                  generatedInvitationLink?.invitation.invitationId === invitation.invitationId &&
                  isShowingGeneratedInvitationLink;

                return (
                  <div
                    key={invitation.invitationId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{invitationLabel}</p>
                        <Badge variant="outline" className="capitalize">
                          {invitation.role}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                        >
                          Pending
                        </Badge>
                      </div>
                      {secondaryIdentity ? (
                        <p className="text-xs text-muted-foreground">{secondaryIdentity}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isGeneratedInvitationActive ? (
                        <p className="text-xs text-muted-foreground">Link open in Sharing</p>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onCopyInvitationLink(invitation)}
                        >
                          Copy link
                        </Button>
                      )}
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
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
