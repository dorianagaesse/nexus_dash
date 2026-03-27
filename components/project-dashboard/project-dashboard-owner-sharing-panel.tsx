"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Search, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  formatIdentity,
  type CollaboratorIdentitySummary,
  type GeneratedProjectInvitationLink,
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
  generatedInvitationLink: GeneratedProjectInvitationLink | null;
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
  onCopyInvitationLink: (invitation: ProjectInvitationSummary) => Promise<boolean> | boolean;
  onRevokeInvitation: (invitation: ProjectInvitationSummary) => void;
}

function getSecondaryIdentity(primaryLabel: string, identityLabel: string): string | null {
  return identityLabel === primaryLabel ? null : identityLabel;
}

export function ProjectDashboardOwnerSharingPanel({
  inviteQuery,
  inviteEmailCandidate,
  inviteRole,
  inviteResults,
  generatedInvitationLink,
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
  const hasExactEmailMatch = Boolean(
    inviteEmailCandidate &&
      inviteResults.some(
        (user) => user.email?.trim().toLowerCase() === inviteEmailCandidate
      )
  );
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);
  const isShowingGeneratedInvitationLink =
    generatedInvitationLink?.invitation.invitedEmail === inviteEmailCandidate;
  const isGeneratedInvitationCopied =
    copiedInvitationId === generatedInvitationLink?.invitation.invitationId;

  useEffect(() => {
    if (!copiedInvitationId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedInvitationId(null);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [copiedInvitationId]);

  useEffect(() => {
    setCopiedInvitationId(null);
  }, [generatedInvitationLink?.invitation.invitationId]);

  const handleCopyGeneratedInvitationLink = async () => {
    if (!generatedInvitationLink) {
      return;
    }

    const didCopy = await onCopyInvitationLink(generatedInvitationLink.invitation);
    if (didCopy) {
      setCopiedInvitationId(generatedInvitationLink.invitation.invitationId);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-background/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Share access</h3>
          </div>
          <p className="text-sm text-muted-foreground">Invite people and manage access.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            id="project-sharing-search"
            aria-label="Collaborator search or email"
            value={inviteQuery}
            onChange={(event) => onInviteQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                !inviteEmailCandidate ||
                hasExactEmailMatch ||
                isShowingGeneratedInvitationLink
              ) {
                return;
              }

              event.preventDefault();
              onInviteByEmail(inviteEmailCandidate);
            }}
            placeholder="Search name, username, or email"
            className="h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <select
          id="project-sharing-role"
          aria-label="Invite role"
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

      <div className="space-y-2">
        {isShowingGeneratedInvitationLink && generatedInvitationLink ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Invite link ready</p>
                <Badge variant="secondary" className="capitalize">
                  {generatedInvitationLink.invitation.role}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Bound to {generatedInvitationLink.invitation.invitedEmail}.
              </p>
              <div className="flex max-w-full items-center gap-2 md:max-w-[28rem]">
                <input
                  readOnly
                  value={generatedInvitationLink.url}
                  aria-label={`Invite link for ${generatedInvitationLink.invitation.invitedEmail}`}
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground outline-none sm:text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Copy invite link for ${generatedInvitationLink.invitation.invitedEmail}`}
                  className="h-9 w-9 shrink-0"
                  onClick={() => void handleCopyGeneratedInvitationLink()}
                >
                  {isGeneratedInvitationCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {inviteEmailCandidate && !hasExactEmailMatch && !isShowingGeneratedInvitationLink ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{inviteEmailCandidate}</p>
              <p className="text-xs text-muted-foreground">
                Create a link and share it when you are ready.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onInviteByEmail(inviteEmailCandidate)}
              disabled={isInvitingUserId === inviteEmailCandidate}
            >
              {isInvitingUserId === inviteEmailCandidate ? "Creating..." : "Create link"}
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
                  {getSecondaryIdentity(user.displayName, formatIdentity(user)) ? (
                    <p className="text-xs text-muted-foreground">
                      {getSecondaryIdentity(user.displayName, formatIdentity(user))}
                    </p>
                  ) : null}
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

      <div className="border-t border-border/60 pt-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Access</h4>
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
                <p className="text-sm text-muted-foreground">
                  Only you have access right now.
                </p>
              ) : null}

              {sharingSummary.members.length > 0 ||
              sharingSummary.pendingInvitations.length > 0 ? (
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

                  {sharingSummary.pendingInvitations.map((invitation) => (
                    (() => {
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
                        generatedInvitationLink?.invitation.invitationId ===
                          invitation.invitationId && isShowingGeneratedInvitationLink;

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
                              <p className="text-xs text-muted-foreground">
                                {secondaryIdentity}
                              </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              Expires {new Date(invitation.expiresAt).toLocaleDateString()}.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isGeneratedInvitationActive ? (
                              <p className="text-xs text-muted-foreground">Link shown above</p>
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
                    })()
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
