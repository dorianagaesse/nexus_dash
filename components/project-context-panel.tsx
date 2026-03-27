"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { ChevronDown, ChevronUp, PanelsTopLeft, PlusSquare } from "lucide-react";
import { useRouter } from "next/navigation";

import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { ContextCardsGrid } from "@/components/context-panel/context-cards-grid";
import { ContextCreateModal } from "@/components/context-panel/context-create-modal";
import { ContextEditModal } from "@/components/context-panel/context-edit-modal";
import { ContextPreviewModal } from "@/components/context-panel/context-preview-modal";
import { useToast } from "@/components/toast-provider";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import type {
  PendingAttachmentLink,
  ProjectContextAttachment,
  ProjectContextCard,
} from "@/components/project-context-panel-types";
import {
  createLocalId,
  getRandomContextColor,
  normalizeContextCardContentHtml,
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
} from "@/lib/direct-upload-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectContextPanelProps {
  canEdit: boolean;
  projectId: string;
  storageProvider: "local" | "r2";
  cards: ProjectContextCard[];
}

export function ProjectContextPanel({
  canEdit,
  projectId,
  storageProvider,
  cards,
}: ProjectContextPanelProps) {
  const isMountedRef = useRef(true);
  const router = useRouter();
  const { pushToast } = useToast();
  const [, startRefreshTransition] = useTransition();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "context",
    defaultExpanded: false,
    logLabel: "ProjectContextPanel",
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createColor, setCreateColor] = useState<string>(getRandomContextColor());
  const [createContent, setCreateContent] = useState("");
  const [createLinkUrl, setCreateLinkUrl] = useState("");
  const [isCreateLinkComposerOpen, setIsCreateLinkComposerOpen] = useState(false);
  const [createAttachmentLinks, setCreateAttachmentLinks] = useState<
    PendingAttachmentLink[]
  >([]);
  const [createSelectedFiles, setCreateSelectedFiles] = useState<File[]>([]);
  const [createFileInputKey, setCreateFileInputKey] = useState(0);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>(CONTEXT_CARD_COLORS[0]);
  const [editContent, setEditContent] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);
  const [isEditLinkComposerOpen, setIsEditLinkComposerOpen] = useState(false);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editFileInputKey, setEditFileInputKey] = useState(0);
  const [previewAttachment, setPreviewAttachment] =
    useState<ProjectContextAttachment | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null);
  const [localCards, setLocalCards] = useState<ProjectContextCard[]>(() =>
    cards.map((card) => ({
      ...card,
      content: normalizeContextCardContentHtml(card.content),
    }))
  );
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
    () => localCards.find((card) => card.id === editingCardId) ?? null,
    [localCards, editingCardId]
  );

  const editingCardAttachments = useMemo(() => {
    if (!editingCard) {
      return [];
    }

    return cardAttachmentsById[editingCard.id] ?? editingCard.attachments;
  }, [cardAttachmentsById, editingCard]);

  const previewCard = useMemo(
    () => localCards.find((card) => card.id === previewCardId) ?? null,
    [localCards, previewCardId]
  );

  const previewCardAttachments = useMemo(() => {
    if (!previewCard) {
      return [];
    }

    return cardAttachmentsById[previewCard.id] ?? previewCard.attachments;
  }, [cardAttachmentsById, previewCard]);

  const pendingDeleteCard = useMemo(
    () => localCards.find((card) => card.id === pendingDeleteCardId) ?? null,
    [localCards, pendingDeleteCardId]
  );

  useEffect(() => {
    setLocalCards(
      cards.map((card) => ({
        ...card,
        content: normalizeContextCardContentHtml(card.content),
      }))
    );
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
    if (!previewCardId) {
      return;
    }

    const stillExists = localCards.some((card) => card.id === previewCardId);
    if (!stillExists) {
      setPreviewCardId(null);
    }
  }, [localCards, previewCardId]);

  const refreshProjectData = () => {
    startRefreshTransition(() => {
      router.refresh();
    });
  };

  const withDownloadUrls = (
    card: Omit<ProjectContextCard, "attachments"> & {
      attachments: Omit<ProjectContextAttachment, "downloadUrl">[];
    }
  ): ProjectContextCard => ({
    ...card,
    attachments: card.attachments.map((attachment) => ({
      ...attachment,
      downloadUrl:
        attachment.kind === ATTACHMENT_KIND_FILE
          ? `/api/projects/${projectId}/context-cards/${card.id}/attachments/${attachment.id}/download`
          : null,
    })),
  });

  const resetCreateAttachmentDraft = () => {
    setCreateContent("");
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
    if (!canEdit) {
      return;
    }

    resetCreateAttachmentDraft();
    setCreateColor(getRandomContextColor());
    setCreateError(null);
    setIsExpanded(true);
    setIsCreateOpen(true);
  };

  const closeEditModal = () => {
    setEditingCardId(null);
    setEditContent("");
    setEditError(null);
    setAttachmentError(null);
    setPreviewAttachment(null);
  };

  const openEditModal = (cardId: string) => {
    if (!canEdit) {
      return;
    }

    const cardToEdit = localCards.find((card) => card.id === cardId);
    if (!cardToEdit) {
      return;
    }

    setPreviewCardId(null);
    setEditingColor(cardToEdit.color);
    setEditContent(normalizeContextCardContentHtml(cardToEdit.content));
    setEditError(null);
    setAttachmentError(null);
    setIsEditLinkComposerOpen(false);
    setEditLinkUrl("");
    setEditFileInputKey((previous) => previous + 1);
    setPreviewAttachment(null);
    setEditingCardId(cardId);
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
          | {
              error?: string;
              cardId?: string;
              card?: {
                id: string;
                title: string;
                content: string;
                color: string;
                attachments: Omit<ProjectContextAttachment, "downloadUrl">[];
              };
            }
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
          pushToast({
            variant: "error",
            message,
          });
          return;
        }
        if (!isMountedRef.current) {
          return;
        }
        const createdCardId =
          payload && typeof payload.cardId === "string" ? payload.cardId : null;
        const createdCard =
          payload?.card && typeof payload.card.id === "string"
            ? withDownloadUrls(payload.card)
            : null;

        if (createdCard) {
          setLocalCards((previous) => [
            {
              ...createdCard,
              content: normalizeContextCardContentHtml(createdCard.content),
            },
            ...previous,
          ]);
          setCardAttachmentsById((previous) => ({
            ...previous,
            [createdCard.id]: createdCard.attachments,
          }));
        }

        pushToast({
          variant: "success",
          message: "Context card created.",
        });
        refreshProjectData();

        const canRunBackgroundUploads =
          storageProvider === "r2" &&
          createdCardId !== null &&
          filesForBackgroundUpload.length > 0;

        if (canRunBackgroundUploads) {
          void uploadFilesDirectInBackground({
            uploads: filesForBackgroundUpload.map((file) => ({
              file,
              uploadTargetUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/upload-url`,
              finalizeUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/direct`,
              cleanupUrl: `/api/projects/${projectId}/context-cards/${createdCardId}/attachments/direct/cleanup`,
              fallbackErrorMessage: `Could not upload file attachment "${file.name}".`,
            })),
            onItemError: (error) => {
              console.error("[ProjectContextPanel.createBackgroundUpload]", error);
            },
          }).then((progress) => {
            if (!isMountedRef.current) {
              return;
            }

            if (progress.failed > 0) {
              pushToast({
                variant: "error",
                message: `Context attachment upload completed with ${progress.failed} failure(s).`,
              });
              return;
            }

            pushToast({
              variant: "success",
              message: `Context attachment upload complete (${progress.total}).`,
            });

            if (progress.completed > progress.failed) {
              refreshProjectData();
            }
          });
        }
      } catch (error) {
        console.error("[ProjectContextPanel.handleCreateCardSubmit]", error);
        const message = "Could not create context card. Please retry.";
        if (!isMountedRef.current) {
          return;
        }
        setCreateError(message);
        pushToast({
          variant: "error",
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

    const formData = new FormData(event.currentTarget);
    const editingCardIdSnapshot = editingCard.id;
    const nextTitle = formData.get("title")?.toString().trim() ?? editingCard.title;
    const nextContent = formData.get("content")?.toString().trim() ?? editingCard.content;
    const nextColor = formData.get("color")?.toString().trim() ?? editingCard.color;
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
          pushToast({
            variant: "error",
            message,
          });
          return;
        }
        if (!isMountedRef.current) {
          return;
        }

        pushToast({
          variant: "success",
          message: "Context card saved.",
        });
        setLocalCards((previous) =>
          previous.map((card) =>
            card.id === editingCardIdSnapshot
              ? {
                  ...card,
                  title: nextTitle,
                  content: normalizeContextCardContentHtml(nextContent),
                  color: nextColor,
                }
              : card
          )
        );
        refreshProjectData();
      } catch (error) {
        console.error("[ProjectContextPanel.handleUpdateCardSubmit]", error);
        const message = "Could not update context card. Please retry.";
        if (!isMountedRef.current) {
          return;
        }
        setEditError(message);
        pushToast({
          variant: "error",
          message,
        });
      }
    })();
  };

  const requestDeleteCard = (cardId: string) => {
    if (!canEdit) {
      return;
    }

    setPendingDeleteCardId(cardId);
  };

  const handleDeleteCard = async () => {
    if (!pendingDeleteCardId) {
      return;
    }

    const cardId = pendingDeleteCardId;
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
        }
        pushToast({
          variant: "error",
          message,
        });
        return;
      }

      if (editingCardId === cardId) {
        closeEditModal();
      }
      if (previewCardId === cardId) {
        setPreviewCardId(null);
      }

      setLocalCards((previous) => previous.filter((card) => card.id !== cardId));
      setCardAttachmentsById((previous) => {
        const next = { ...previous };
        delete next[cardId];
        return next;
      });

      pushToast({
        variant: "success",
        message: "Context card deleted.",
      });
      refreshProjectData();
    } catch (error) {
      console.error("[ProjectContextPanel.handleDeleteCard]", error);
      const message = "Could not delete context card. Please retry.";
      if (editingCardId === cardId) {
        setEditError(message);
      }
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setDeletingCardId(null);
      setPendingDeleteCardId(null);
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
      pushToast({
        variant: "success",
        message: "Attachment link added.",
      });
    } catch (error) {
      console.error("[ProjectContextPanel.handleAddLinkAttachment]", error);
      const message =
        error instanceof Error ? error.message : "Could not add link attachment.";
      setAttachmentError(message);
      pushToast({
        variant: "error",
        message,
      });
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
      pushToast({
        variant: "success",
        message: "Attachment uploaded.",
      });
    } catch (error) {
      console.error("[ProjectContextPanel.handleAddFileAttachment]", error);
      const message =
        error instanceof Error ? error.message : "Could not upload file attachment.";
      setAttachmentError(message);
      pushToast({
        variant: "error",
        message,
      });
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
      pushToast({
        variant: "success",
        message: "Attachment deleted.",
      });
    } catch (error) {
      console.error("[ProjectContextPanel.handleDeleteAttachment]", error);
      const message =
        error instanceof Error ? error.message : "Could not delete attachment.";
      setAttachmentError(message);
      pushToast({
        variant: "error",
        message,
      });
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader
        className={cn(
          `space-y-3 ${PROJECT_SECTION_HEADER_CLASS} px-5 pt-5`,
          isExpanded ? "pb-4" : "pb-3"
        )}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-muted/40"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg font-semibold tracking-tight">
                <span className="inline-flex items-center gap-2">
                  <PanelsTopLeft className="h-4 w-4 text-muted-foreground" />
                  Project context
                </span>
              </CardTitle>
            </div>
            <span className="ml-auto rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
              {localCards.length} card{localCards.length === 1 ? "" : "s"}
            </span>
          </button>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="rounded-full px-4"
              onClick={openCreateModal}
            >
              <PlusSquare className="h-4 w-4" />
              Add card
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
          <CardContent className={PROJECT_SECTION_CONTENT_CLASS}>
            <ContextCardsGrid
              canEdit={canEdit}
              cards={localCards}
              cardAttachmentsById={cardAttachmentsById}
              deletingCardId={deletingCardId}
              onOpenPreview={setPreviewCardId}
            onEditCard={openEditModal}
            onDeleteCard={requestDeleteCard}
            onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
          />
        </CardContent>
      ) : null}

      <ContextCreateModal
        isOpen={isCreateOpen}
        isCreatingCard={isCreatingCard}
        createColor={createColor}
        createContent={createContent}
        createLinkUrl={createLinkUrl}
        isCreateLinkComposerOpen={isCreateLinkComposerOpen}
        createAttachmentLinks={createAttachmentLinks}
        createSelectedFiles={createSelectedFiles}
        createFileInputKey={createFileInputKey}
        createError={createError}
        onClose={closeCreateModal}
        onSubmit={handleCreateCardSubmit}
        onCreateColorChange={setCreateColor}
        onCreateContentChange={setCreateContent}
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
        editContent={editContent}
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
        onEditContentChange={setEditContent}
        onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
        onDeleteAttachment={handleDeleteAttachment}
        onToggleEditLinkComposer={() =>
          setIsEditLinkComposerOpen((previous) => !previous)
        }
        onAddFileAttachment={handleAddFileAttachment}
        onEditLinkUrlChange={setEditLinkUrl}
        onAddLinkAttachment={handleAddLinkAttachment}
      />

      <ContextPreviewModal
        canEdit={canEdit}
        isOpen={Boolean(previewCard)}
        card={previewCard}
        attachments={previewCardAttachments}
        onClose={() => setPreviewCardId(null)}
        onEdit={openEditModal}
        onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteCardId)}
        title="Delete context card?"
        description={
          pendingDeleteCard
            ? `This will permanently remove "${pendingDeleteCard.title}" and all of its attachments.`
            : "This will permanently remove this context card and all of its attachments."
        }
        confirmLabel="Delete card"
        isConfirming={Boolean(
          pendingDeleteCardId && deletingCardId === pendingDeleteCardId
        )}
        onConfirm={handleDeleteCard}
        onCancel={() => setPendingDeleteCardId(null)}
      />

      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </Card>
  );
}
