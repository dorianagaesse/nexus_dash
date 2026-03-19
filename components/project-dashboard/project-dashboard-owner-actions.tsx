"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Settings2, Share2, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";

type ProjectCollaboratorRole = "editor" | "viewer";
type ProjectDashboardSettingsTab = "general" | "sharing";

interface CollaboratorIdentitySummary {
  id: string;
  displayName: string;
  usernameTag: string | null;
  email: string | null;
}

interface ProjectMemberSummary extends CollaboratorIdentitySummary {
  membershipId: string;
  role: "owner" | ProjectCollaboratorRole;
  joinedAt: string;
  isOwner: boolean;
}

interface ProjectInvitationSummary {
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

interface ProjectSharingSummary {
  projectId: string;
  members: ProjectMemberSummary[];
  pendingInvitations: ProjectInvitationSummary[];
}

interface ProjectDashboardOwnerActionsProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
}

const ROLE_COPY: Record<ProjectCollaboratorRole, string> = {
  editor: "Can collaborate and edit project content.",
  viewer: "Can view project content without editing.",
};

function formatIdentity(summary: CollaboratorIdentitySummary): string {
  return summary.usernameTag ?? summary.email ?? summary.displayName;
}

function mapProjectMutationError(errorCode: string): string {
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

function mapSharingError(errorCode: string): string {
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

function buildRoleSummary(role: ProjectCollaboratorRole): string {
  return role === "editor"
    ? "Invited to collaborate on this project"
    : "Invited to view this project";
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
          setSearchMessage(users.length === 0 ? "No matching verified users found." : null);
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
  }, [activeTab, inviteQuery, isOpen, projectId]);

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

  const handleInvite = async (user: CollaboratorIdentitySummary) => {
    if (isInvitingUserId) {
      return;
    }

    setIsInvitingUserId(user.id);

    try {
      const response = await fetch(`/api/projects/${projectId}/sharing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invitedUserId: user.id,
          role: inviteRole,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "invite-failed"));
      }

      pushToast({
        variant: "success",
        message: `${user.displayName} invited as ${inviteRole}.`,
      });
      setInviteQuery("");
      setInviteResults([]);
      setSearchMessage(null);
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

    if (!window.confirm(`Revoke the invitation for ${invitation.invitedUserDisplayName}?`)) {
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
      pushToast({
        variant: "success",
        message: `Invitation revoked for ${invitation.invitedUserDisplayName}.`,
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
                        Manage project metadata, collaborators, and pending invitations.
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
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">General metadata</h3>
                          <p className="text-sm text-muted-foreground">
                            Update the project name and description used across the workspace.
                          </p>
                        </div>

                        <div className="grid gap-2">
                          <label htmlFor="project-settings-name" className="text-sm font-medium">
                            Project name
                          </label>
                          <EmojiInputField
                            id="project-settings-name"
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            minLength={2}
                            maxLength={120}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>

                        <div className="grid gap-2">
                          <label
                            htmlFor="project-settings-description"
                            className="text-sm font-medium"
                          >
                            Description
                          </label>
                          <EmojiTextareaField
                            id="project-settings-description"
                            value={descriptionDraft}
                            onChange={(event) => setDescriptionDraft(event.target.value)}
                            maxLength={500}
                            rows={5}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>

                        {projectError ? (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {projectError}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => void handleSaveProject()}
                            disabled={!hasProjectChanges || isSavingProject}
                          >
                            {isSavingProject ? "Saving..." : "Save changes"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setNameDraft(projectName);
                              setDescriptionDraft(projectDescription ?? "");
                              setProjectError(null);
                            }}
                            disabled={isSavingProject}
                          >
                            Reset
                          </Button>
                        </div>
                      </section>

                      <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">Danger zone</h3>
                          <p className="text-sm text-muted-foreground">
                            Deleting a project removes its tasks, context cards, and invitations.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete project
                        </Button>
                      </section>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserPlus className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-base font-semibold">Invite collaborator</h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Search existing verified NexusDash users and invite them to collaborate.
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                          <div className="grid gap-2">
                            <label htmlFor="project-sharing-search" className="text-sm font-medium">
                              Search user
                            </label>
                            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
                              <Search className="h-4 w-4 text-muted-foreground" />
                              <input
                                id="project-sharing-search"
                                value={inviteQuery}
                                onChange={(event) => setInviteQuery(event.target.value)}
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
                                setInviteRole(event.target.value as ProjectCollaboratorRole)
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
                                    <p className="text-xs text-muted-foreground">
                                      {formatIdentity(user)}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => void handleInvite(user)}
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
                                  <p className="text-xs text-muted-foreground">
                                    {formatIdentity(member)}
                                  </p>
                                </div>

                                {member.isOwner ? (
                                  <p className="text-xs text-muted-foreground">Project owner</p>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      value={member.role}
                                      onChange={(event) =>
                                        void handleRoleChange(
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
                                      onClick={() => void handleRemoveMember(member)}
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
                                      {invitation.invitedUserDisplayName}
                                    </p>
                                    <Badge variant="outline" className="capitalize">
                                      {invitation.role}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {formatIdentity({
                                      id: invitation.invitedUserId,
                                      displayName: invitation.invitedUserDisplayName,
                                      usernameTag: invitation.invitedUserUsernameTag,
                                      email: invitation.invitedUserEmail,
                                    })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {buildRoleSummary(invitation.role)}. Expires{" "}
                                    {new Date(invitation.expiresAt).toLocaleDateString()}.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => void handleRevokeInvitation(invitation)}
                                  disabled={isMutatingInvitationId === invitation.invitationId}
                                >
                                  {isMutatingInvitationId === invitation.invitationId
                                    ? "Revoking..."
                                    : "Revoke"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    </div>
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
