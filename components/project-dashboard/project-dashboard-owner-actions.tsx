"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectDashboardOwnerGeneralPanel } from "@/components/project-dashboard/project-dashboard-owner-general-panel";
import { ProjectDashboardOwnerSharingPanel } from "@/components/project-dashboard/project-dashboard-owner-sharing-panel";
import {
  type GeneratedProjectInvitationLink,
  mapProjectMutationError,
  mapSharingError,
  type CollaboratorIdentitySummary,
  type ProjectCollaboratorRole,
  type ProjectDashboardSettingsTab,
  type ProjectInvitationSummary,
  type ProjectMemberSummary,
  type ProjectSharingSummary,
} from "@/components/project-dashboard/project-dashboard-owner-actions.shared";

function normalizeInviteEmailCandidate(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function buildAbsoluteInvitationLink(inviteLinkPath: string, origin: string): string {
  return new URL(inviteLinkPath, origin).toString();
}

interface ProjectDashboardOwnerActionsProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
}

export function ProjectDashboardOwnerActions({
  projectId,
  projectName,
  projectDescription,
}: ProjectDashboardOwnerActionsProps) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectDashboardSettingsTab>("general");
  const [nameDraft, setNameDraft] = useState(projectName);
  const [descriptionDraft, setDescriptionDraft] = useState(projectDescription ?? "");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [sharingSummary, setSharingSummary] = useState<ProjectSharingSummary | null>(null);
  const [isLoadingSharing, setIsLoadingSharing] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectCollaboratorRole>("editor");
  const [inviteResults, setInviteResults] = useState<CollaboratorIdentitySummary[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isInvitingUserId, setIsInvitingUserId] = useState<string | null>(null);
  const [isMutatingMemberId, setIsMutatingMemberId] = useState<string | null>(null);
  const [isMutatingInvitationId, setIsMutatingInvitationId] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [generatedInvitationLink, setGeneratedInvitationLink] =
    useState<GeneratedProjectInvitationLink | null>(null);
  const inviteEmailCandidate = useMemo(
    () => normalizeInviteEmailCandidate(inviteQuery),
    [inviteQuery]
  );

  useEffect(() => {
    setNameDraft(projectName);
  }, [projectName]);

  useEffect(() => {
    setDescriptionDraft(projectDescription ?? "");
  }, [projectDescription]);

  const hasProjectChanges = useMemo(
    () =>
      nameDraft.trim() !== projectName.trim() ||
      descriptionDraft.trim() !== (projectDescription ?? "").trim(),
    [descriptionDraft, nameDraft, projectDescription, projectName]
  );

  const closeModal = () => {
    if (isSavingProject || isDeletingProject) {
      return;
    }

    setGeneratedInvitationLink(null);
    setIsOpen(false);
  };

  const openModal = (nextTab: ProjectDashboardSettingsTab) => {
    setProjectError(null);
    setSharingError(null);
    setSearchMessage(null);
    setActiveTab(nextTab);
    setIsOpen(true);
  };

  const loadSharingSummary = useCallback(async () => {
    setIsLoadingSharing(true);
    setSharingError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sharing`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (ProjectSharingSummary & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(mapSharingError(payload?.error ?? "sharing-load-failed"));
      }

      setSharingSummary(payload);
    } catch (error) {
      setSharingError(
        error instanceof Error
          ? error.message
          : "Could not load project sharing. Please retry."
      );
    } finally {
      setIsLoadingSharing(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen || activeTab !== "sharing") {
      return;
    }

    void loadSharingSummary();
  }, [activeTab, isOpen, loadSharingSummary]);

  useEffect(() => {
    if (!isOpen || activeTab !== "sharing") {
      return;
    }

    const trimmedQuery = inviteQuery.trim();
    if (trimmedQuery.length < 2) {
      setInviteResults([]);
      setSearchMessage(trimmedQuery.length === 0 ? null : "Type at least 2 characters.");
      setIsSearchingUsers(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsSearchingUsers(true);
        setSearchMessage(null);

        try {
          const response = await fetch(
            `/api/projects/${projectId}/sharing/search?query=${encodeURIComponent(trimmedQuery)}`,
            {
              cache: "no-store",
            }
          );
          const payload = (await response.json().catch(() => null)) as
            | { users?: CollaboratorIdentitySummary[]; error?: string }
            | null;

          if (!response.ok || !payload) {
            throw new Error(mapSharingError(payload?.error ?? "sharing-search-failed"));
          }

          const users = payload.users ?? [];
          setInviteResults(users);
          setSearchMessage(
            users.length === 0
              ? inviteEmailCandidate
                ? "No verified account found yet. Create a link below."
                : "No matching verified users found."
              : null
          );
        } catch (error) {
          setInviteResults([]);
          setSearchMessage(
            error instanceof Error ? error.message : "Could not search users. Please retry."
          );
        } finally {
          setIsSearchingUsers(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, inviteEmailCandidate, inviteQuery, isOpen, projectId]);

  const handleSaveProject = async () => {
    if (isSavingProject) {
      return;
    }

    if (nameDraft.trim().length < 2) {
      setProjectError("Project name must be at least 2 characters long.");
      return;
    }

    setIsSavingProject(true);
    setProjectError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nameDraft.trim(),
          description: descriptionDraft.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapProjectMutationError(payload?.error ?? "update-failed"));
      }

      pushToast({
        variant: "success",
        message: "Project settings saved.",
      });
      router.refresh();
      setIsOpen(false);
    } catch (error) {
      setProjectError(
        error instanceof Error
          ? error.message
          : "Could not save project settings. Please retry."
      );
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (isDeletingProject) {
      return;
    }

    setIsDeletingProject(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapProjectMutationError(payload?.error ?? "delete-failed"));
      }

      router.push("/projects?status=deleted");
      router.refresh();
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not delete project. Please retry.",
      });
      setIsDeleteDialogOpen(false);
      setIsDeletingProject(false);
    }
  };

  const handleResetProject = () => {
    setNameDraft(projectName);
    setDescriptionDraft(projectDescription ?? "");
    setProjectError(null);
  };

  const handleInviteQueryChange = (value: string) => {
    const nextInviteEmailCandidate = normalizeInviteEmailCandidate(value);

    setInviteQuery(value);

    if (
      generatedInvitationLink &&
      nextInviteEmailCandidate !== generatedInvitationLink.invitation.invitedEmail
    ) {
      setGeneratedInvitationLink(null);
    }
  };

  const handleInviteEmail = async (
    invitedEmail: string,
    label: string,
    pendingId = invitedEmail,
    source: "email" | "user" = "email"
  ) => {
    if (isInvitingUserId) {
      return;
    }

    setIsInvitingUserId(pendingId);

    try {
      const response = await fetch(`/api/projects/${projectId}/sharing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invitedEmail,
          role: inviteRole,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            invitation?: ProjectInvitationSummary;
          }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "invite-failed"));
      }

      const invitation = payload?.invitation ?? null;

      if (source === "email" && invitation) {
        setGeneratedInvitationLink({
          invitation,
          url: buildAbsoluteInvitationLink(invitation.inviteLinkPath, window.location.origin),
        });
        setSearchMessage(null);
        pushToast({
          variant: "success",
          message: `Invite link ready for ${invitedEmail}.`,
        });
      } else {
        setGeneratedInvitationLink(null);
        setInviteQuery("");
        setInviteResults([]);
        setSearchMessage(null);
        pushToast({
          variant: "success",
          message: `${label} invited as ${inviteRole}.`,
        });
      }

      await loadSharingSummary();
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not send invitation. Please retry.",
      });
    } finally {
      setIsInvitingUserId(null);
    }
  };

  const handleInvite = async (user: CollaboratorIdentitySummary) => {
    if (!user.email) {
      pushToast({
        variant: "error",
        message: "That account is missing an email address.",
      });
      return;
    }

    await handleInviteEmail(user.email, user.displayName, user.id, "user");
  };

  const handleRoleChange = async (
    member: ProjectMemberSummary,
    nextRole: ProjectCollaboratorRole
  ) => {
    if (member.role === nextRole || member.isOwner || isMutatingMemberId) {
      return;
    }

    setIsMutatingMemberId(member.membershipId);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/sharing/members/${member.membershipId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: nextRole }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "member-update-failed"));
      }

      setSharingSummary((previous) =>
        previous
          ? {
              ...previous,
              members: previous.members.map((entry) =>
                entry.membershipId === member.membershipId
                  ? { ...entry, role: nextRole }
                  : entry
              ),
            }
          : previous
      );
      pushToast({
        variant: "success",
        message: `${member.displayName} is now ${nextRole}.`,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not update collaborator role. Please retry.",
      });
      await loadSharingSummary();
    } finally {
      setIsMutatingMemberId(null);
    }
  };

  const handleRemoveMember = async (member: ProjectMemberSummary) => {
    if (member.isOwner || isMutatingMemberId) {
      return;
    }

    if (!window.confirm(`Remove ${member.displayName} from ${projectName}?`)) {
      return;
    }

    setIsMutatingMemberId(member.membershipId);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/sharing/members/${member.membershipId}`,
        {
          method: "DELETE",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "member-remove-failed"));
      }

      setSharingSummary((previous) =>
        previous
          ? {
              ...previous,
              members: previous.members.filter(
                (entry) => entry.membershipId !== member.membershipId
              ),
            }
          : previous
      );
      pushToast({
        variant: "success",
        message: `${member.displayName} removed from the project.`,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not remove collaborator. Please retry.",
      });
      await loadSharingSummary();
    } finally {
      setIsMutatingMemberId(null);
    }
  };

  const handleRevokeInvitation = async (invitation: ProjectInvitationSummary) => {
    if (isMutatingInvitationId) {
      return;
    }

    const invitationLabel =
      invitation.invitedUserDisplayName ?? invitation.invitedEmail;
    if (!window.confirm(`Revoke the invitation for ${invitationLabel}?`)) {
      return;
    }

    setIsMutatingInvitationId(invitation.invitationId);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/sharing/invitations/${invitation.invitationId}`,
        {
          method: "DELETE",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "invitation-revoke-failed"));
      }

      setSharingSummary((previous) =>
        previous
          ? {
              ...previous,
              pendingInvitations: previous.pendingInvitations.filter(
                (entry) => entry.invitationId !== invitation.invitationId
              ),
            }
          : previous
      );
      if (
        generatedInvitationLink?.invitation.invitationId === invitation.invitationId
      ) {
        setGeneratedInvitationLink(null);
      }
      pushToast({
        variant: "success",
        message: `Invitation revoked for ${invitationLabel}.`,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not revoke invitation. Please retry.",
      });
      await loadSharingSummary();
    } finally {
      setIsMutatingInvitationId(null);
    }
  };

  const handleCopyInvitationLink = async (invitation: ProjectInvitationSummary) => {
    try {
      await navigator.clipboard.writeText(
        buildAbsoluteInvitationLink(invitation.inviteLinkPath, window.location.origin)
      );
      pushToast({
        variant: "success",
        message: `Invite link copied for ${invitation.invitedEmail}.`,
      });
      return true;
    } catch {
      pushToast({
        variant: "error",
        message: "Could not copy invite link. Please retry.",
      });
      return false;
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="rounded-full px-4"
          onClick={() => openModal("sharing")}
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full px-4"
          onClick={() => openModal("general")}
        >
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </div>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex min-h-dvh w-screen items-center justify-center bg-black/70 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeModal();
                }
              }}
            >
              <Card
                className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b border-border/60">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        Project settings
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        Owner only
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{projectName}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Sharing, members, and project details.
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={closeModal}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={activeTab === "general" ? "secondary" : "outline"}
                      className="rounded-full px-4"
                      onClick={() => setActiveTab("general")}
                    >
                      <Settings2 className="h-4 w-4" />
                      General
                    </Button>
                    <Button
                      type="button"
                      variant={activeTab === "sharing" ? "secondary" : "outline"}
                      className="rounded-full px-4"
                      onClick={() => setActiveTab("sharing")}
                    >
                      <Share2 className="h-4 w-4" />
                      Sharing
                    </Button>
                  </div>

                  {activeTab === "general" ? (
                    <ProjectDashboardOwnerGeneralPanel
                      nameDraft={nameDraft}
                      descriptionDraft={descriptionDraft}
                      hasProjectChanges={hasProjectChanges}
                      isSavingProject={isSavingProject}
                      projectError={projectError}
                      onNameDraftChange={setNameDraft}
                      onDescriptionDraftChange={setDescriptionDraft}
                      onSaveProject={() => void handleSaveProject()}
                      onResetProject={handleResetProject}
                      onOpenDeleteDialog={() => setIsDeleteDialogOpen(true)}
                    />
                  ) : (
                    <ProjectDashboardOwnerSharingPanel
                      inviteQuery={inviteQuery}
                      inviteEmailCandidate={inviteEmailCandidate}
                      inviteRole={inviteRole}
                      inviteResults={inviteResults}
                      generatedInvitationLink={generatedInvitationLink}
                      isSearchingUsers={isSearchingUsers}
                      isInvitingUserId={isInvitingUserId}
                      isLoadingSharing={isLoadingSharing}
                      sharingError={sharingError}
                      sharingSummary={sharingSummary}
                      searchMessage={searchMessage}
                      isMutatingMemberId={isMutatingMemberId}
                      isMutatingInvitationId={isMutatingInvitationId}
                      onInviteQueryChange={handleInviteQueryChange}
                      onInviteRoleChange={setInviteRole}
                      onInviteByEmail={(email) => void handleInviteEmail(email, email)}
                      onInvite={(user) => void handleInvite(user)}
                      onRoleChange={(member, nextRole) =>
                        void handleRoleChange(member, nextRole)
                      }
                      onRemoveMember={(member) => void handleRemoveMember(member)}
                      onCopyInvitationLink={handleCopyInvitationLink}
                      onRevokeInvitation={(invitation) =>
                        void handleRevokeInvitation(invitation)
                      }
                    />
                  )}
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete project?"
        description={`Delete "${projectName}"? This action cannot be undone.`}
        confirmLabel="Delete project"
        isConfirming={isDeletingProject}
        onConfirm={handleDeleteProject}
        onCancel={() => {
          if (isDeletingProject) {
            return;
          }

          setIsDeleteDialogOpen(false);
        }}
      />
    </>
  );
}
