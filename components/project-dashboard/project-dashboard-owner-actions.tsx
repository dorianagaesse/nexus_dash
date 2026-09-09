"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Settings2, Share2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";

import type { AgentScope } from "@/lib/agent-access";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProjectDashboardOwnerAgentAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-agent-access-panel";
import { ProjectDashboardOwnerAccessPanel } from "@/components/project-dashboard/project-dashboard-owner-access-panel";
import { ProjectDashboardOwnerGeneralPanel } from "@/components/project-dashboard/project-dashboard-owner-general-panel";
import { ProjectDashboardOwnerSharingPanel } from "@/components/project-dashboard/project-dashboard-owner-sharing-panel";
import { ProjectOffboardingDialog } from "@/components/project-dashboard/project-offboarding-dialog";
import {
  type GeneratedProjectInvitationLink,
  formatInvitationEmailDelivery,
  mapAgentAccessError,
  mapProjectMutationError,
  mapSharingError,
  type CollaboratorIdentitySummary,
  type ProjectInvitationEmailDeliverySummary,
  type ProjectAgentAccessSummary,
  type ProjectAgentCredentialIssuedSecret,
  type ProjectAgentCredentialSummary,
  type ProjectCollaboratorRole,
  type ProjectDashboardSettingsTab,
  type ProjectInvitationSummary,
  type ProjectMemberSummary,
  type ProjectResponsibilityInventory,
  type ProjectSharingSummary,
  type ResponsibilityResolution,
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

interface LatestAgentCredentialSecret extends ProjectAgentCredentialIssuedSecret {
  mode: "created" | "rotated";
}

type OffboardingDialogState =
  | {
      variant: "remove-member";
      actorKind: "human";
      actorId: string;
      actorLabel: string;
      member: ProjectMemberSummary;
    }
  | {
      variant: "revoke-agent";
      actorKind: "agent";
      actorId: string;
      actorLabel: string;
      credential: ProjectAgentCredentialSummary;
    }
  | {
      variant: "transfer-owner";
      actorKind: "human";
      actorId: string;
      actorLabel: string;
      transferTarget: ProjectMemberSummary;
    };

export function ProjectDashboardOwnerActions({
  projectId,
  projectName,
  projectDescription,
}: ProjectDashboardOwnerActionsProps) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [sidebarActionsTarget, setSidebarActionsTarget] =
    useState<HTMLElement | null>(null);
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
  const [agentAccessSummary, setAgentAccessSummary] =
    useState<ProjectAgentAccessSummary | null>(null);
  const [isLoadingAgentAccess, setIsLoadingAgentAccess] = useState(false);
  const [agentAccessError, setAgentAccessError] = useState<string | null>(null);
  const [isCreatingAgentCredential, setIsCreatingAgentCredential] = useState(false);
  const [mutatingAgentCredentialId, setMutatingAgentCredentialId] =
    useState<string | null>(null);
  const [latestAgentCredentialSecret, setLatestAgentCredentialSecret] =
    useState<LatestAgentCredentialSecret | null>(null);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectCollaboratorRole>("editor");
  const [inviteResults, setInviteResults] = useState<CollaboratorIdentitySummary[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isInvitingUserId, setIsInvitingUserId] = useState<string | null>(null);
  const [isMutatingMemberId, setIsMutatingMemberId] = useState<string | null>(null);
  const [isMutatingInvitationId, setIsMutatingInvitationId] = useState<string | null>(null);
  const [sendingInvitationEmailId, setSendingInvitationEmailId] =
    useState<string | null>(null);
  const [invitationEmailDeliveries, setInvitationEmailDeliveries] = useState<
    Record<string, ProjectInvitationEmailDeliverySummary | undefined>
  >({});
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [generatedInvitationLink, setGeneratedInvitationLink] =
    useState<GeneratedProjectInvitationLink | null>(null);
  const [offboardingDialog, setOffboardingDialog] =
    useState<OffboardingDialogState | null>(null);
  const [responsibilityInventory, setResponsibilityInventory] =
    useState<ProjectResponsibilityInventory | null>(null);
  const [isLoadingResponsibilities, setIsLoadingResponsibilities] = useState(false);
  const [isSubmittingOffboarding, setIsSubmittingOffboarding] = useState(false);
  const [offboardingError, setOffboardingError] = useState<string | null>(null);
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

  useEffect(() => {
    setSidebarActionsTarget(document.getElementById("project-sidebar-actions"));
  }, []);

  const hasProjectChanges = useMemo(
    () =>
      nameDraft.trim() !== projectName.trim() ||
      descriptionDraft.trim() !== (projectDescription ?? "").trim(),
    [descriptionDraft, nameDraft, projectDescription, projectName]
  );

  const closeModal = () => {
    if (
      isSavingProject ||
      isDeletingProject ||
      isCreatingAgentCredential ||
      mutatingAgentCredentialId ||
      sendingInvitationEmailId ||
      isSubmittingOffboarding
    ) {
      return;
    }

    setGeneratedInvitationLink(null);
    setLatestAgentCredentialSecret(null);
    setIsOpen(false);
  };

  const openOffboardingDialog = async (dialog: OffboardingDialogState) => {
    setIsOpen(false);
    setOffboardingDialog(dialog);
    setResponsibilityInventory(null);
    setOffboardingError(null);
    setIsLoadingResponsibilities(true);

    try {
      const query = new URLSearchParams({
        actorKind: dialog.actorKind,
        actorId: dialog.actorId,
      });
      const response = await fetch(
        `/api/projects/${projectId}/offboarding?${query.toString()}`
      );
      const payload = (await response.json().catch(() => null)) as
        | { inventory?: ProjectResponsibilityInventory; error?: string }
        | null;
      if (!response.ok || !payload?.inventory) {
        throw new Error(mapSharingError(payload?.error ?? "responsibility-load-failed"));
      }
      setResponsibilityInventory(payload.inventory);
    } catch (error) {
      setOffboardingError(
        error instanceof Error
          ? error.message
          : "Could not load active responsibilities. Please retry."
      );
    } finally {
      setIsLoadingResponsibilities(false);
    }
  };

  const closeOffboardingDialog = () => {
    if (isSubmittingOffboarding) {
      return;
    }
    setOffboardingDialog(null);
    setResponsibilityInventory(null);
    setOffboardingError(null);
    setIsOpen(true);
  };

  const openModal = (nextTab: ProjectDashboardSettingsTab) => {
    setProjectError(null);
    setSharingError(null);
    setAgentAccessError(null);
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

  const loadAgentAccessSummary = useCallback(async () => {
    setIsLoadingAgentAccess(true);
    setAgentAccessError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/agent-access`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (ProjectAgentAccessSummary & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(mapAgentAccessError(payload?.error ?? "agent-access-load-failed"));
      }

      setAgentAccessSummary(payload);
    } catch (error) {
      setAgentAccessError(
        error instanceof Error
          ? error.message
          : "Could not load agent access. Please retry."
      );
    } finally {
      setIsLoadingAgentAccess(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (
      !isOpen ||
      (activeTab !== "sharing" && activeTab !== "access" && activeTab !== "agents")
    ) {
      return;
    }

    void loadSharingSummary();
  }, [activeTab, isOpen, loadSharingSummary]);

  useEffect(() => {
    if (
      !isOpen ||
      agentAccessSummary ||
      agentAccessError ||
      isLoadingAgentAccess
    ) {
      return;
    }

    void loadAgentAccessSummary();
  }, [
    agentAccessError,
    agentAccessSummary,
    isLoadingAgentAccess,
    isOpen,
    loadAgentAccessSummary,
  ]);

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
                ? "No verified account found yet. Send an invitation below."
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

  const rememberInvitationEmailDelivery = (
    invitationId: string,
    delivery: ProjectInvitationEmailDeliverySummary | null | undefined
  ) => {
    if (!delivery) {
      return;
    }

    setInvitationEmailDeliveries((current) => ({
      ...current,
      [invitationId]: delivery,
    }));
  };

  const buildInvitationEmailDeliveryToast = (
    delivery: ProjectInvitationEmailDeliverySummary | null | undefined,
    fallback: string
  ) => {
    const message = formatInvitationEmailDelivery(delivery);
    if (!message) {
      return fallback;
    }

    if (delivery?.status === "sent") {
      return message;
    }

    return `${fallback} ${message}`;
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
            emailDelivery?: ProjectInvitationEmailDeliverySummary;
          }
        | null;

      if (!response.ok) {
        throw new Error(mapSharingError(payload?.error ?? "invite-failed"));
      }

      const invitation = payload?.invitation ?? null;
      const emailDelivery = payload?.emailDelivery ?? null;

      if (source === "email" && invitation) {
        rememberInvitationEmailDelivery(invitation.invitationId, emailDelivery);
        setGeneratedInvitationLink({
          invitation,
          url: buildAbsoluteInvitationLink(invitation.inviteLinkPath, window.location.origin),
          emailDelivery,
        });
        setSearchMessage(null);
        pushToast({
          variant: emailDelivery?.status === "failed" ? "error" : "success",
          message: buildInvitationEmailDeliveryToast(
            emailDelivery,
            `Invitation created for ${invitedEmail}.`
          ),
        });
      } else {
        if (invitation) {
          rememberInvitationEmailDelivery(invitation.invitationId, emailDelivery);
        }
        setGeneratedInvitationLink(null);
        setInviteQuery("");
        setInviteResults([]);
        setSearchMessage(null);
        pushToast({
          variant: emailDelivery?.status === "failed" ? "error" : "success",
          message: buildInvitationEmailDeliveryToast(
            emailDelivery,
            `${label} invited as ${inviteRole}.`
          ),
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

  const handleSendInvitationEmail = async (
    invitation: ProjectInvitationSummary
  ) => {
    if (sendingInvitationEmailId) {
      return;
    }

    setSendingInvitationEmailId(invitation.invitationId);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/sharing/invitations/${invitation.invitationId}/email`,
        {
          method: "POST",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            invitation?: ProjectInvitationSummary;
            emailDelivery?: ProjectInvitationEmailDeliverySummary;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.emailDelivery) {
        throw new Error(mapSharingError(payload?.error ?? "invite-email-failed"));
      }

      rememberInvitationEmailDelivery(
        invitation.invitationId,
        payload.emailDelivery
      );
      pushToast({
        variant: payload.emailDelivery.status === "failed" ? "error" : "success",
        message: buildInvitationEmailDeliveryToast(
          payload.emailDelivery,
          `Invite link remains ready for ${invitation.invitedEmail}.`
        ),
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not send the invitation email. Please retry.",
      });
    } finally {
      setSendingInvitationEmailId(null);
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

  const handleRemoveMember = (member: ProjectMemberSummary) => {
    if (member.isOwner || isMutatingMemberId) {
      return;
    }
    void openOffboardingDialog({
      variant: "remove-member",
      actorKind: "human",
      actorId: member.id,
      actorLabel: member.displayName,
      member,
    });
  };

  const handleTransferOwnership = (member: ProjectMemberSummary) => {
    const owner = sharingSummary?.members.find((entry) => entry.isOwner);
    if (!owner || member.isOwner || isSubmittingOffboarding) {
      return;
    }
    void openOffboardingDialog({
      variant: "transfer-owner",
      actorKind: "human",
      actorId: owner.id,
      actorLabel: owner.displayName,
      transferTarget: member,
    });
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

  const handleCreateAgentCredential = async (input: {
    label: string;
    scopes: AgentScope[];
    expiresInDays: number | null;
  }) => {
    if (isCreatingAgentCredential) {
      return;
    }

    setIsCreatingAgentCredential(true);
    setAgentAccessError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/agent-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ProjectAgentCredentialIssuedSecret & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(mapAgentAccessError(payload?.error ?? "credential-create-failed"));
      }

      setLatestAgentCredentialSecret({
        ...payload,
        mode: "created",
      });
      pushToast({
        variant: "success",
        message: `Credential ${payload.credential.label} created.`,
      });
      await loadAgentAccessSummary();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create the credential. Please retry.";
      setAgentAccessError(message);
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setIsCreatingAgentCredential(false);
    }
  };

  const handleRotateAgentCredential = async (
    credential: ProjectAgentCredentialSummary
  ) => {
    if (mutatingAgentCredentialId) {
      return;
    }

    if (
      !window.confirm(
        `Rotate ${credential.label}? The current raw API key will stop working for future token exchanges.`
      )
    ) {
      return;
    }

    setMutatingAgentCredentialId(credential.id);
    setAgentAccessError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/agent-access/${credential.id}/rotate`,
        {
          method: "POST",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | (ProjectAgentCredentialIssuedSecret & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(mapAgentAccessError(payload?.error ?? "credential-rotate-failed"));
      }

      setLatestAgentCredentialSecret({
        ...payload,
        mode: "rotated",
      });
      pushToast({
        variant: "success",
        message: `Credential ${payload.credential.label} rotated.`,
      });
      await loadAgentAccessSummary();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not rotate the credential. Please retry.";
      setAgentAccessError(message);
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setMutatingAgentCredentialId(null);
    }
  };

  const handleRevokeAgentCredential = (
    credential: ProjectAgentCredentialSummary
  ) => {
    if (mutatingAgentCredentialId) {
      return;
    }
    void openOffboardingDialog({
      variant: "revoke-agent",
      actorKind: "agent",
      actorId: credential.id,
      actorLabel: credential.label,
      credential,
    });
  };

  const submitOffboarding = async (input: {
    previousOwnerLeaves: boolean;
    responsibilityResolution: ResponsibilityResolution | null;
  }) => {
    const dialog = offboardingDialog;
    if (!dialog || isSubmittingOffboarding) {
      return;
    }

    setIsSubmittingOffboarding(true);
    setOffboardingError(null);
    try {
      if (dialog.variant === "remove-member") {
        setIsMutatingMemberId(dialog.member.membershipId);
        const response = await fetch(
          `/api/projects/${projectId}/sharing/members/${dialog.member.membershipId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              responsibilityResolution: input.responsibilityResolution,
            }),
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; inventory?: ProjectResponsibilityInventory }
          | null;
        if (!response.ok) {
          if (payload?.inventory) {
            setResponsibilityInventory(payload.inventory);
          }
          throw new Error(mapSharingError(payload?.error ?? "member-remove-failed"));
        }
        setSharingSummary((previous) =>
          previous
            ? {
                ...previous,
                members: previous.members.filter(
                  (entry) => entry.membershipId !== dialog.member.membershipId
                ),
              }
            : previous
        );
        pushToast({
          variant: "success",
          message: `${dialog.member.displayName} removed from the project.`,
        });
      } else if (dialog.variant === "revoke-agent") {
        setMutatingAgentCredentialId(dialog.credential.id);
        const response = await fetch(
          `/api/projects/${projectId}/agent-access/${dialog.credential.id}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              responsibilityResolution: input.responsibilityResolution,
            }),
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | {
              credential?: ProjectAgentCredentialSummary;
              error?: string;
              inventory?: ProjectResponsibilityInventory;
            }
          | null;
        if (!response.ok || !payload) {
          if (payload?.inventory) {
            setResponsibilityInventory(payload.inventory);
          }
          throw new Error(mapSharingError(payload?.error ?? "credential-revoke-failed"));
        }
        setLatestAgentCredentialSecret((currentSecret) =>
          currentSecret?.credential.id === dialog.credential.id
            ? null
            : currentSecret
        );
        await loadAgentAccessSummary();
        pushToast({
          variant: "success",
          message: `Credential ${dialog.credential.label} revoked.`,
        });
      } else {
        const response = await fetch(`/api/projects/${projectId}/ownership/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newOwnerMembershipId: dialog.transferTarget.membershipId,
            previousOwnerLeaves: input.previousOwnerLeaves,
            responsibilityResolution: input.responsibilityResolution,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; inventory?: ProjectResponsibilityInventory }
          | null;
        if (!response.ok) {
          if (payload?.inventory) {
            setResponsibilityInventory(payload.inventory);
          }
          throw new Error(mapSharingError(payload?.error ?? "ownership-transfer-failed"));
        }
        pushToast({
          variant: "success",
          message: input.previousOwnerLeaves
            ? `Ownership transferred to ${dialog.transferTarget.displayName}. You left ${projectName}.`
            : `Ownership transferred to ${dialog.transferTarget.displayName}.`,
        });
        setOffboardingDialog(null);
        setIsOpen(false);
        if (input.previousOwnerLeaves) {
          router.push("/projects");
        }
        router.refresh();
        return;
      }

      setOffboardingDialog(null);
      setResponsibilityInventory(null);
      setIsOpen(true);
    } catch (error) {
      setOffboardingError(
        error instanceof Error
          ? error.message
          : "Could not complete the handoff. Please retry."
      );
    } finally {
      setIsMutatingMemberId(null);
      setMutatingAgentCredentialId(null);
      setIsSubmittingOffboarding(false);
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

  const isProjectSettingsDismissible =
    !isSavingProject &&
    !isDeletingProject &&
    !isCreatingAgentCredential &&
    !mutatingAgentCredentialId &&
    !sendingInvitationEmailId;

  return (
    <>
      <div className="flex w-full flex-row gap-2 sm:w-auto sm:flex-wrap sm:items-center">
        <Button
          type="button"
          className="min-h-11 min-w-0 flex-1 rounded-xl px-4 shadow-sm sm:flex-none"
          onClick={() => openModal("sharing")}
        >
          <Share2 className="h-4 w-4" />
          Share project
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-0 flex-1 rounded-xl px-4 sm:flex-none lg:hidden"
          onClick={() => openModal("general")}
        >
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </div>

      {sidebarActionsTarget
        ? createPortal(
            <Button
              type="button"
              variant="ghost"
              className="hidden min-h-12 w-full justify-start rounded-xl px-3 text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
              onClick={() => openModal("general")}
            >
              <span className="grid h-7 w-7 place-items-center">
                <Settings2 className="h-5 w-5" aria-hidden />
              </span>
              Project settings
            </Button>,
            sidebarActionsTarget
          )
        : null}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
      >
        <DialogContent
          dismissible={isProjectSettingsDismissible}
          className="z-[130] flex max-h-[100dvh] min-w-0 w-full max-w-4xl flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
          overlayClassName="z-[120]"
        >
                <DialogTitle className="sr-only">Project settings: {projectName}</DialogTitle>
                <CardHeader className="flex flex-col gap-4 space-y-0 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between">
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
                      <DialogDescription>
                        Project details, invitations, contributors, and agent access.
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeModal}
                    className="self-end sm:self-auto"
                    aria-label="Close project settings"
                    disabled={!isProjectSettingsDismissible}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>

                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6">
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
                    <Button
                      type="button"
                      variant={activeTab === "access" ? "secondary" : "outline"}
                      className="rounded-full px-4"
                      onClick={() => setActiveTab("access")}
                    >
                      <Users className="h-4 w-4" />
                      Contributors
                    </Button>
                    <Button
                      type="button"
                      variant={activeTab === "agents" ? "secondary" : "outline"}
                      className="rounded-full px-4"
                      onClick={() => setActiveTab("agents")}
                    >
                      <Bot className="h-4 w-4" />
                      Agent access
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
                  ) : activeTab === "sharing" ? (
                    <ProjectDashboardOwnerSharingPanel
                      inviteQuery={inviteQuery}
                      inviteEmailCandidate={inviteEmailCandidate}
                      inviteRole={inviteRole}
                      inviteResults={inviteResults}
                      generatedInvitationLink={generatedInvitationLink}
                      isSearchingUsers={isSearchingUsers}
                      isInvitingUserId={isInvitingUserId}
                      searchMessage={searchMessage}
                      onInviteQueryChange={handleInviteQueryChange}
                      onInviteRoleChange={setInviteRole}
                      onInviteByEmail={(email) => void handleInviteEmail(email, email)}
                      onInvite={(user) => void handleInvite(user)}
                      onCopyInvitationLink={handleCopyInvitationLink}
                    />
                  ) : activeTab === "access" ? (
                    <ProjectDashboardOwnerAccessPanel
                      isLoadingSharing={isLoadingSharing}
                      sharingError={sharingError}
                      sharingSummary={sharingSummary}
                      isMutatingMemberId={isMutatingMemberId}
                      isMutatingInvitationId={isMutatingInvitationId}
                      sendingInvitationEmailId={sendingInvitationEmailId}
                      invitationEmailDeliveries={invitationEmailDeliveries}
                      onRoleChange={(member, nextRole) =>
                        void handleRoleChange(member, nextRole)
                      }
                      onRemoveMember={(member) => void handleRemoveMember(member)}
                      onTransferOwnership={(member) =>
                        void handleTransferOwnership(member)
                      }
                      onCopyInvitationLink={handleCopyInvitationLink}
                      onSendInvitationEmail={(invitation) =>
                        void handleSendInvitationEmail(invitation)
                      }
                      onRevokeInvitation={(invitation) =>
                        void handleRevokeInvitation(invitation)
                      }
                    />
                  ) : (
                    <ProjectDashboardOwnerAgentAccessPanel
                      projectId={projectId}
                      accessSummary={agentAccessSummary}
                      isLoadingAccessSummary={isLoadingAgentAccess}
                      accessError={agentAccessError}
                      isCreatingCredential={isCreatingAgentCredential}
                      mutatingCredentialId={mutatingAgentCredentialId}
                      latestIssuedSecret={latestAgentCredentialSecret}
                      onCreateCredential={(input) => void handleCreateAgentCredential(input)}
                      onRotateCredential={(credential) =>
                        void handleRotateAgentCredential(credential)
                      }
                      onRevokeCredential={(credential) =>
                        void handleRevokeAgentCredential(credential)
                      }
                      onDismissLatestSecret={() => setLatestAgentCredentialSecret(null)}
                    />
                  )}
                </CardContent>
        </DialogContent>
      </Dialog>

      {offboardingDialog ? (
        <ProjectOffboardingDialog
          isOpen
          variant={offboardingDialog.variant}
          actorLabel={offboardingDialog.actorLabel}
          transferTargetLabel={
            offboardingDialog.variant === "transfer-owner"
              ? offboardingDialog.transferTarget.displayName
              : undefined
          }
          inventory={responsibilityInventory}
          replacementCandidates={(sharingSummary?.members ?? []).filter(
            (member) => member.id !== offboardingDialog.actorId
          )}
          suggestedReplacementUserId={
            offboardingDialog.variant === "transfer-owner"
              ? offboardingDialog.transferTarget.id
              : sharingSummary?.members.find((member) => member.isOwner)?.id
          }
          isLoading={isLoadingResponsibilities}
          isSubmitting={isSubmittingOffboarding}
          error={offboardingError}
          onCancel={closeOffboardingDialog}
          onConfirm={submitOffboarding}
        />
      ) : null}

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
