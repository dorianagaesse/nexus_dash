"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";

import {
  formatIdentity,
  type ProjectCollaboratorRole,
  type ProjectInvitationSummary,
  type ProjectMemberSummary,
  type ProjectSharingSummary,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

interface ProjectDashboardOwnerAccessPanelProps {
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
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedInvitationId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedInvitationId(null);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [copiedInvitationId]);

  const buildInvitationLink = (invitation: ProjectInvitationSummary) => {
    if (typeof window === "undefined") {
      return invitation.inviteLinkPath;
    }

    return new URL(invitation.inviteLinkPath, window.location.origin).toString();
  };

  const handleCopyInvitation = async (invitation: ProjectInvitationSummary) => {
    const didCopy = await onCopyInvitationLink(invitation);
    if (didCopy) {
      setCopiedInvitationId(invitation.invitationId);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Contributors</h3>
          <p className="text-sm text-muted-foreground">Manage collaborators and pending invites.</p>
        </div>
        {sharingSummary ? (
          <p className="text-xs text-muted-foreground">
            {sharingSummary.members.length + sharingSummary.pendingInvitations.length} total
          </p>
        ) : null}
      </div>

      {isLoadingSharing ? (
        <p className="text-sm text-muted-foreground">Loading contributors...</p>
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
            <p className="text-sm text-muted-foreground">Only you are on this project right now.</p>
          ) : null}

          {sharingSummary.members.length > 0 || sharingSummary.pendingInvitations.length > 0 ? (
            <div className="space-y-2">
              {sharingSummary.members.map((member) => (
                <div
                  key={member.membershipId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      avatarSeed={member.avatarSeed}
                      displayName={member.displayName}
                      className="h-10 w-10 border-border/70"
                      decorative
                    />
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
                      avatarSeed: invitation.invitedUserId ?? invitation.invitedEmail,
                    })
                  : invitation.invitedEmail;
                const secondaryIdentity = getSecondaryIdentity(
                  invitationLabel,
                  invitationIdentity
                );
                const isEmailOnlyInvitation = !invitation.invitedUserDisplayName;
                const isCopied = copiedInvitationId === invitation.invitationId;

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
                      {isEmailOnlyInvitation ? (
                        <div className="flex max-w-full items-center gap-2 md:max-w-[28rem]">
                          <input
                            readOnly
                            value={buildInvitationLink(invitation)}
                            aria-label={`Invite link for ${invitation.invitedEmail}`}
                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground outline-none sm:text-sm"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Copy invite link for ${invitation.invitedEmail}`}
                            className="h-9 w-9 shrink-0"
                            onClick={() => void handleCopyInvitation(invitation)}
                          >
                            {isCopied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyInvitation(invitation)}
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
