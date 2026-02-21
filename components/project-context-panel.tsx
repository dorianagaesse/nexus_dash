"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, PanelsTopLeft, PlusSquare } from "lucide-react";
import { useRouter } from "next/navigation";

import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { ContextCardsGrid } from "@/components/context-panel/context-cards-grid";
import { ContextCreateModal } from "@/components/context-panel/context-create-modal";
import { ContextEditModal } from "@/components/context-panel/context-edit-modal";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import type {
  ContextMutationStatus,
  PendingAttachmentLink,
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import {
  createLocalId,
  getRandomContextColor,
  readApiError,
} from "@/components/project-context-panel-utils";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_LABEL,
} from "@/lib/task-attachment";
import {
  uploadFileAttachmentDirect,
  uploadFilesDirectInBackground,
  type DirectUploadBackgroundProgress,
} from "@/lib/direct-upload-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectContextPanelProps {
  projectId: string;
  storageProvider: "local" | "r2";
  cards: ProjectContextCard[];
}

export function ProjectContextPanel({
  projectId,
  storageProvider,
  cards,
}: ProjectContextPanelProps) {
  const isMountedRef = useRef(true);
  const router = useRouter();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "context",
    defaultExpanded: false,
    logLabel: "ProjectContextPanel",
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createColor, setCreateColor] = useState<string>(getRandomContextColor());
  const [createLinkUrl, setCreateLinkUrl] = useState("");
  const [isCreateLinkComposerOpen, setIsCreateLinkComposerOpen] = useState(false);
  const [createAttachmentLinks, setCreateAttachmentLinks] = useState<
    PendingAttachmentLink[]
  >([]);
  const [createSelectedFiles, setCreateSelectedFiles] = useState<File[]>([]);
  const [createFileInputKey, setCreateFileInputKey] = useState(0);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>(CONTEXT_CARD_COLORS[0]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [createBackgroundUploadProgress, setCreateBackgroundUploadProgress] =
    useState<DirectUploadBackgroundProgress | null>(null);
  const [contextMutationStatus, setContextMutationStatus] =
    useState<ContextMutationStatus | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);
  const [isEditLinkComposerOpen, setIsEditLinkComposerOpen] = useState(false);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editFileInputKey, setEditFileInputKey] = useState(0);
  const [previewAttachment, setPreviewAttachment] =
    useState<ProjectContextAttachment | null>(null);
  const [cardAttachmentsById, setCardAttachmentsById] = useState<
    Record<string, ProjectContextAttachment[]>
  >({});
  const maxAttachmentFileSizeBytes =
    storageProvider === "r2"
      ? DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES
      : MAX_ATTACHMENT_FILE_SIZE_BYTES;
  const maxAttachmentFileSizeLabel =
    storageProvider === "r2"
      ? DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL
      : MAX_ATTACHMENT_FILE_SIZE_LABEL;
  const attachmentFileSizeErrorMessage = `Attachment files must be ${maxAttachmentFileSizeLabel} or smaller.`;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const editingCard = useMemo(
    () => cards.find((card) => card.id === editingCardId) ?? null,
    [cards, editingCardId]
  );

  const editingCardAttachments = useMemo(() => {
    if (!editingCard) {
      return [];
    }

    return cardAttachmentsById[editingCard.id] ?? editingCard.attachments;
  }, [cardAttachmentsById, editingCard]);

  useEffect(() => {
    if (!editingCard) {
      return;
    }
    setEditingColor(editingCard.color);
    setEditError(null);
    setAttachmentError(null);
    setIsEditLinkComposerOpen(false);
    setEditLinkUrl("");
    setEditFileInputKey((previous) => previous + 1);
    setPreviewAttachment(null);
  }, [editingCard]);

  useEffect(() => {
    setCardAttachmentsById(
      Object.fromEntries(cards.map((card) => [card.id, card.attachments]))
    );
  }, [cards]);

  useEffect(() => {
    if (!editingCard || !previewAttachment) {
      return;
    }

    const attachments = cardAttachmentsById[editingCard.id] ?? editingCard.attachments;
    const stillExists = attachments.some(
      (attachment) => attachment.id === previewAttachment.id
    );

    if (!stillExists) {
      setPreviewAttachment(null);
    }
  }, [cardAttachmentsById, editingCard, previewAttachment]);

  useEffect(() => {
    if (!contextMutationStatus || contextMutationStatus.phase === "running") {
      return;
    }

    const timer = window.setTimeout(() => {
      setContextMutationStatus(null);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [contextMutationStatus]);

  useEffect(() => {
    if (
      !createBackgroundUploadProgress ||
      createBackgroundUploadProgress.phase === "uploading"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCreateBackgroundUploadProgress(null);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [createBackgroundUploadProgress]);

  const resetCreateAttachmentDraft = () => {
    setCreateLinkUrl("");
    setIsCreateLinkComposerOpen(false);
    setCreateAttachmentLinks([]);
    setCreateSelectedFiles([]);
    setCreateFileInputKey((previous) => previous + 1);
  };

  const closeCreateModal = () => {
    resetCreateAttachmentDraft();
    setCreateError(null);
    setIsCreateOpen(false);
  };

  const openCreateModal = () => {
    resetCreateAttachmentDraft();
    setCreateColor(getRandomContextColor());
    setCreateError(null);
    setIsExpanded(true);
    setIsCreateOpen(true);
  };

  const closeEditModal = () => {
    setEditingCardId(null);
    setEditError(null);
    setAttachmentError(null);
    setPreviewAttachment(null);
  };

  const handleStageCreateLink = () => {
    const normalizedUrl = createLinkUrl.trim();
    if (!normalizedUrl) {
      return;
    }

    setCreateAttachmentLinks((previous) => [
      {
        id: createLocalId(),
        url: normalizedUrl,
      },
      ...previous,
    ]);
    setCreateLinkUrl("");
    setIsCreateLinkComposerOpen(false);
  };

  const handleRemoveCreateLink = (linkId: string) => {
    setCreateAttachmentLinks((previous) =>
      previous.filter((link) => link.id !== linkId)
    );
  };

  const handleCreateFilesSelected = (nextFiles: File[]) => {
    const hasOversizedFile = nextFiles.some(
      (file) => file.size > maxAttachmentFileSizeBytes
    );

    if (hasOversizedFile) {
      setCreateSelectedFiles([]);
      setCreateError(attachmentFileSizeErrorMessage);
      setCreateFileInputKey((previous) => previous + 1);
      return;
    }

    setCreateSelectedFiles(nextFiles);
    setCreateError(null);
  };

  const mapContextMutationError = (errorCode: string, fallback: string): string => {
    switch (errorCode) {
      case "project-not-found":
        return "Project not found.";
      case "attachment-link-invalid":
        return "One or more attachment links are invalid. Use http:// or https:// URLs.";
      case "attachment-file-too-large":
        return attachmentFileSizeErrorMessage;
      case "attachment-file-type-invalid":
        return "Unsupported attachment file type. Use PDF, image, text, CSV, or JSON.";
      case "context-card-missing":
        return "Context card identifier is missing.";
      case "context-card-not-found":
        return "Context card not found.";
      case "context-title-too-short":
        return "Context card title must be at least 2 characters long.";
      case "context-title-too-long":
        return "Context card title must be 120 characters or fewer.";
      case "context-content-too-long":
        return "Context card content must be 4000 characters or fewer.";
      case "context-color-invalid":
        return "Selected context card color is invalid.";
      case "context-create-failed":
        return "Could not create context card. Please retry.";
      case "context-update-failed":
        return "Could not update context card. Please retry.";
      case "context-delete-failed":
        return "Could not delete context card. Please retry.";
      default:
        return fallback;
    }
  };

  const handleCreateCardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingCard) {
      return;
    }

    if (createSelectedFiles.some((file) => file.size > maxAttachmentFileSizeBytes)) {
      setCreateError(attachmentFileSizeErrorMessage);
      return;
    }

    setIsCreatingCard(true);
    setCreateError(null);
    setContextMutationStatus({
      phase: "running",
      message: "Creating context card in background...",
    });

    const formData = new FormData(event.currentTarget);
    const filesForBackgroundUpload =
      storageProvider === "r2" ? [...createSelectedFiles] : [];

    if (storageProvider === "r2") {
      formData.delete("attachmentFiles");
    }

    closeCreateModal();
    setIsCreatingCard(false);

    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/context-cards`, {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string; cardId?: string }
          | null;

        if (!response.ok) {
          const message = mapContextMutationError(
            payload?.error ?? "context-create-failed",
            "Could not create context card. Please retry."
          );
          if (!isMountedRef.current) {
            return;
          }
          setCreateError(message);
          setContextMutationStatus({
            phase: "failed",
            message,
          });
          return;
        }
        if (!isMountedRef.current) {
          return;
        }
        const createdCardId =
          payload && typeof payload.cardId === "string" ? payload.cardId : null;

        setContextMutationStatus({
          phase: "done",
          message: "Context card created. Refreshing context panel...",
        });
        window.setTimeout(() => router.refresh(), 0);

        if (
          storageProvider === "r2" &&
          createdCardId &&
          filesForBackgroundUpload.length > 0
        ) {
          void uploadFilesDirectInBackground({
            uploads: filesForBackgroundUpload.map((file) => ({
              file,
              uploadTargetUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/upload-url`,
              finalizeUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/direct`,
              cleanupUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/direct/cleanup`,
              fallbackErrorMessage: `Could not upload file attachment "${file.name}".`,
            })),
            onProgress: (progress) => {
              if (!isMountedRef.current) {
                return;
              }
              setCreateBackgroundUploadProgress(progress);
            },
            onItemError: (error) => {
              console.error("[ProjectContextPanel.createBackgroundUpload]", error);
            },
          }).finally(() => {
            window.setTimeout(() => router.refresh(), 0);
          });
        }
      } catch (error) {
        console.error("[ProjectContextPanel.handleCreateCardSubmit]", error);
        const message = "Could not create context card. Please retry.";
        if (!isMountedRef.current) {
          return;
        }
        setCreateError(message);
        setContextMutationStatus({
          phase: "failed",
          message,
        });
      }
    })();
  };

  const handleUpdateCardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCard || isUpdatingCard) {
      return;
    }

    setIsUpdatingCard(true);
    setEditError(null);
    setContextMutationStatus({
      phase: "running",
      message: "Saving context card in background...",
    });

    const formData = new FormData(event.currentTarget);
    const editingCardIdSnapshot = editingCard.id;
    closeEditModal();
    setIsUpdatingCard(false);

    void (async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/context-cards/${editingCardIdSnapshot}`,
          {
            method: "PATCH",
            body: formData,
          }
        );

        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          const message = mapContextMutationError(
            payload?.error ?? "context-update-failed",
            "Could not update context card. Please retry."
          );
          if (!isMountedRef.current) {
            return;
          }
          setEditError(message);
          setContextMutationStatus({
            phase: "failed",
            message,
          });
          return;
        }
        if (!isMountedRef.current) {
          return;
        }

        setContextMutationStatus({
          phase: "done",
          message: "Context card saved. Refreshing context panel...",
        });
        window.setTimeout(() => router.refresh(), 0);
      } catch (error) {
        console.error("[ProjectContextPanel.handleUpdateCardSubmit]", error);
        const message = "Could not update context card. Please retry.";
        if (!isMountedRef.current) {
          return;
        }
        setEditError(message);
        setContextMutationStatus({
          phase: "failed",
          message,
        });
      }
    })();
  };

  const handleDeleteCard = async (cardId: string) => {
    if (deletingCardId) {
      return;
    }

    setDeletingCardId(cardId);
    try {
      const response = await fetch(`/api/projects/${projectId}/context-cards/${cardId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        const message = mapContextMutationError(
          payload?.error ?? "context-delete-failed",
          "Could not delete context card. Please retry."
        );
        if (editingCardId === cardId) {
          setEditError(message);
        } else {
          window.alert(message);
        }
        return;
      }

      if (editingCardId === cardId) {
        closeEditModal();
      }
      router.refresh();
    } catch (error) {
      console.error("[ProjectContextPanel.handleDeleteCard]", error);
      const message = "Could not delete context card. Please retry.";
      if (editingCardId === cardId) {
        setEditError(message);
      } else {
        window.alert(message);
      }
    } finally {
      setDeletingCardId(null);
    }
  };

  const handleAddLinkAttachment = async () => {
    if (!editingCard || !editLinkUrl.trim()) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_LINK);
      formData.append("name", "");
      formData.append("url", editLinkUrl.trim());

      const response = await fetch(
        `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not add link attachment."));
      }

      const payload = (await response.json()) as { attachment: ProjectContextAttachment };
      setCardAttachmentsById((previous) => ({
        ...previous,
        [editingCard.id]: [payload.attachment, ...(previous[editingCard.id] ?? [])],
      }));
      setEditLinkUrl("");
      setIsEditLinkComposerOpen(false);
    } catch (error) {
      console.error("[ProjectContextPanel.handleAddLinkAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not add link attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleAddFileAttachment = async (selectedFile: File | null) => {
    if (!editingCard || !selectedFile) {
      return;
    }

    if (selectedFile.size > maxAttachmentFileSizeBytes) {
      setAttachmentError(attachmentFileSizeErrorMessage);
      setEditFileInputKey((previous) => previous + 1);
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      let attachment: ProjectContextAttachment;

      if (storageProvider === "r2") {
        attachment = await uploadFileAttachmentDirect<ProjectContextAttachment>({
          file: selectedFile,
          uploadTargetUrl: `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments/upload-url`,
          finalizeUrl: `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments/direct`,
          cleanupUrl: `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments/direct/cleanup`,
          fallbackErrorMessage: "Could not upload file attachment.",
        });
      } else {
        const formData = new FormData();
        formData.append("kind", ATTACHMENT_KIND_FILE);
        formData.append("name", "");
        formData.append("file", selectedFile);

        const response = await fetch(
          `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(await readApiError(response, "Could not upload file attachment."));
        }

        const payload = (await response.json()) as {
          attachment: ProjectContextAttachment;
        };
        attachment = payload.attachment;
      }

      setCardAttachmentsById((previous) => ({
        ...previous,
        [editingCard.id]: [attachment, ...(previous[editingCard.id] ?? [])],
      }));
      setEditFileInputKey((previous) => previous + 1);
    } catch (error) {
      console.error("[ProjectContextPanel.handleAddFileAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not upload file attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!editingCard) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/context-cards/${editingCard.id}/attachments/${attachmentId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not delete attachment."));
      }

      setCardAttachmentsById((previous) => ({
        ...previous,
        [editingCard.id]: (previous[editingCard.id] ?? []).filter(
          (attachment) => attachment.id !== attachmentId
        ),
      }));
    } catch (error) {
      console.error("[ProjectContextPanel.handleDeleteAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not delete attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className={cn("space-y-2 px-0 pt-0", isExpanded ? "pb-3" : "pb-2")}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-muted/40"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-lg font-semibold tracking-tight">
              <span className="inline-flex items-center gap-2">
                <PanelsTopLeft className="h-4 w-4 text-muted-foreground" />
                Project context
              </span>
            </CardTitle>
            {!isExpanded ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {cards.length} card{cards.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </button>
          <Button type="button" size="sm" onClick={openCreateModal}>
            <PlusSquare className="h-4 w-4" />
            Add card
          </Button>
        </div>
        {isExpanded ? (
          <p className="text-sm text-muted-foreground">
            Keep project notes in compact cards above the board.
          </p>
        ) : null}
        {createBackgroundUploadProgress ? (
          <p className="text-xs text-muted-foreground">
            {createBackgroundUploadProgress.phase === "uploading"
              ? `Uploading context attachments in background (${createBackgroundUploadProgress.completed}/${createBackgroundUploadProgress.total})...`
              : createBackgroundUploadProgress.phase === "done"
                ? `Context attachment upload complete (${createBackgroundUploadProgress.total}/${createBackgroundUploadProgress.total}).`
                : `Context attachment upload finished with ${createBackgroundUploadProgress.failed} failure(s).`}
          </p>
        ) : null}
        {contextMutationStatus ? (
          <p
            className={
              contextMutationStatus.phase === "failed"
                ? "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
            role="status"
            aria-live="polite"
          >
            {contextMutationStatus.message}
          </p>
        ) : null}
      </CardHeader>

      {isExpanded ? (
        <CardContent className="px-0">
          <ContextCardsGrid
            cards={cards}
            cardAttachmentsById={cardAttachmentsById}
            deletingCardId={deletingCardId}
            onEditCard={setEditingCardId}
            onDeleteCard={handleDeleteCard}
            onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
          />
        </CardContent>
      ) : null}

      <ContextCreateModal
        isOpen={isCreateOpen}
        isCreatingCard={isCreatingCard}
        createColor={createColor}
        createLinkUrl={createLinkUrl}
        isCreateLinkComposerOpen={isCreateLinkComposerOpen}
        createAttachmentLinks={createAttachmentLinks}
        createSelectedFiles={createSelectedFiles}
        createFileInputKey={createFileInputKey}
        createError={createError}
        onClose={closeCreateModal}
        onSubmit={handleCreateCardSubmit}
        onCreateColorChange={setCreateColor}
        onCreateLinkUrlChange={setCreateLinkUrl}
        onToggleCreateLinkComposer={() =>
          setIsCreateLinkComposerOpen((previous) => !previous)
        }
        onStageCreateLink={handleStageCreateLink}
        onRemoveCreateLink={handleRemoveCreateLink}
        onCreateFilesSelected={handleCreateFilesSelected}
        onClearCreateFiles={() => {
          setCreateSelectedFiles([]);
          setCreateFileInputKey((previous) => previous + 1);
        }}
      />

      <ContextEditModal
        editingCard={editingCard}
        editingColor={editingColor}
        editingCardAttachments={editingCardAttachments}
        isUpdatingCard={isUpdatingCard}
        isSubmittingAttachment={isSubmittingAttachment}
        isEditLinkComposerOpen={isEditLinkComposerOpen}
        editLinkUrl={editLinkUrl}
        editFileInputKey={editFileInputKey}
        attachmentError={attachmentError}
        editError={editError}
        onClose={closeEditModal}
        onSubmit={handleUpdateCardSubmit}
        onEditingColorChange={setEditingColor}
        onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
        onDeleteAttachment={handleDeleteAttachment}
        onToggleEditLinkComposer={() =>
          setIsEditLinkComposerOpen((previous) => !previous)
        }
        onAddFileAttachment={handleAddFileAttachment}
        onEditLinkUrlChange={setEditLinkUrl}
        onAddLinkAttachment={handleAddLinkAttachment}
      />

      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </Card>
  );
}
