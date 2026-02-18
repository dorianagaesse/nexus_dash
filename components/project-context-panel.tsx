"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Link2,
  PanelsTopLeft,
  Paperclip,
  Pencil,
  PlusSquare,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { AttachmentPreviewModal } from "@/components/attachment-preview-modal";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import {
  createLocalId,
  getRandomContextColor,
  readApiError,
  resolveAttachmentHref,
} from "@/components/project-context-panel-utils";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
  isAttachmentPreviewable,
} from "@/lib/task-attachment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectContextAttachment {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

interface ProjectContextCard {
  id: string;
  title: string;
  content: string;
  color: string;
  attachments: ProjectContextAttachment[];
}

interface PendingAttachmentLink {
  id: string;
  url: string;
}

interface ProjectContextPanelProps {
  projectId: string;
  cards: ProjectContextCard[];
}

function ColorPicker({
  selectedColor,
  onSelect,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">Card color</label>
      <div className="flex flex-wrap gap-2">
        {CONTEXT_CARD_COLORS.map((color) => {
          const isSelected = selectedColor === color;
          return (
            <button
              key={color}
              type="button"
              className="h-7 w-7 rounded-full border transition"
              style={{
                backgroundColor: color,
                borderColor: isSelected ? "rgb(15 23 42 / 0.9)" : "rgb(15 23 42 / 0.2)",
                boxShadow: isSelected ? "0 0 0 2px rgb(15 23 42 / 0.15)" : "none",
              }}
              onClick={() => onSelect(color)}
              aria-label={`Select color ${color}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function ModalFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-lg" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function ProjectContextPanel({
  projectId,
  cards,
}: ProjectContextPanelProps) {
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

  const serializedCreateLinks = JSON.stringify(
    createAttachmentLinks.map((link) => ({
      name: "",
      url: link.url,
    }))
  );

  const mapContextMutationError = (errorCode: string, fallback: string): string => {
    switch (errorCode) {
      case "project-not-found":
        return "Project not found.";
      case "attachment-link-invalid":
        return "One or more attachment links are invalid. Use http:// or https:// URLs.";
      case "attachment-file-too-large":
        return "Attachment files must be 10MB or smaller.";
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

    setIsCreatingCard(true);
    setCreateError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch(`/api/projects/${projectId}/context-cards`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setCreateError(
          mapContextMutationError(
            payload?.error ?? "context-create-failed",
            "Could not create context card. Please retry."
          )
        );
        return;
      }

      closeCreateModal();
      router.refresh();
    } catch (error) {
      console.error("[ProjectContextPanel.handleCreateCardSubmit]", error);
      setCreateError("Could not create context card. Please retry.");
    } finally {
      setIsCreatingCard(false);
    }
  };

  const handleUpdateCardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCard || isUpdatingCard) {
      return;
    }

    setIsUpdatingCard(true);
    setEditError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch(
        `/api/projects/${projectId}/context-cards/${editingCard.id}`,
        {
          method: "PATCH",
          body: formData,
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setEditError(
          mapContextMutationError(
            payload?.error ?? "context-update-failed",
            "Could not update context card. Please retry."
          )
        );
        return;
      }

      closeEditModal();
      router.refresh();
    } catch (error) {
      console.error("[ProjectContextPanel.handleUpdateCardSubmit]", error);
      setEditError("Could not update context card. Please retry.");
    } finally {
      setIsUpdatingCard(false);
    }
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

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
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

      const payload = (await response.json()) as { attachment: ProjectContextAttachment };
      setCardAttachmentsById((previous) => ({
        ...previous,
        [editingCard.id]: [payload.attachment, ...(previous[editingCard.id] ?? [])],
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
      </CardHeader>

      {isExpanded ? (
        <CardContent className="px-0">
          {cards.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
              No context cards yet.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => {
                const attachments = cardAttachmentsById[card.id] ?? card.attachments;
                const previewAttachments = attachments.slice(0, 2);

                return (
                  <article
                    key={card.id}
                    className="rounded-md border p-2.5"
                    style={{ backgroundColor: card.color, borderColor: "rgb(15 23 42 / 0.15)" }}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-slate-800 hover:bg-slate-900/10"
                          onClick={() => setEditingCardId(card.id)}
                          aria-label="Edit context card"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-slate-800 hover:bg-slate-900/10"
                          onClick={() => void handleDeleteCard(card.id)}
                          disabled={deletingCardId === card.id}
                          aria-label="Delete context card"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs text-slate-800">
                      {card.content || "No content."}
                    </p>

                    {attachments.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {previewAttachments.map((attachment) => {
                          const href = resolveAttachmentHref(attachment);
                          const canPreview = isAttachmentPreviewable(
                            attachment.kind,
                            attachment.mimeType
                          ) && Boolean(attachment.downloadUrl);

                          if (canPreview) {
                            return (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => setPreviewAttachment(attachment)}
                                className="flex min-w-0 items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                              >
                                <Paperclip className="h-3 w-3" />
                                <span className="truncate">{attachment.name}</span>
                              </button>
                            );
                          }

                          if (!href) {
                            return null;
                          }

                          return (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-1"
                            >
                              <a
                                href={href}
                                target={
                                  attachment.kind === ATTACHMENT_KIND_LINK
                                    ? "_blank"
                                    : undefined
                                }
                                rel={
                                  attachment.kind === ATTACHMENT_KIND_LINK
                                    ? "noreferrer"
                                    : undefined
                                }
                                className="flex min-w-0 flex-1 items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                              >
                                <Paperclip className="h-3 w-3" />
                                <span className="truncate">{attachment.name}</span>
                              </a>
                            </div>
                          );
                        })}
                        {attachments.length > previewAttachments.length ? (
                          <p className="text-xs text-slate-700">
                            +{attachments.length - previewAttachments.length} more attachment
                            {attachments.length - previewAttachments.length === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      ) : null}

      {isCreateOpen ? (
        <ModalFrame title="Add context card" onClose={closeCreateModal}>
          <form className="grid gap-4" onSubmit={(event) => void handleCreateCardSubmit(event)}>
            <div className="grid gap-2">
              <label htmlFor="context-create-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="context-create-title"
                name="title"
                required
                minLength={2}
                maxLength={120}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Sprint notes"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="context-create-content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="context-create-content"
                name="content"
                rows={5}
                maxLength={4000}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Anything useful for this project..."
              />
            </div>

            <ColorPicker selectedColor={createColor} onSelect={setCreateColor} />
            <input type="hidden" name="color" value={createColor} />
            <input type="hidden" name="attachmentLinks" value={serializedCreateLinks} />

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={isCreateLinkComposerOpen ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setIsCreateLinkComposerOpen((previous) => !previous)}
                  aria-label="Add attachment link"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
                <input
                  key={createFileInputKey}
                  id="context-create-attachment-files"
                  type="file"
                  name="attachmentFiles"
                  multiple
                  onChange={(event) =>
                    setCreateSelectedFiles(Array.from(event.target.files ?? []))
                  }
                  className="hidden"
                />
                <Button type="button" variant="ghost" size="icon" asChild>
                  <label
                    htmlFor="context-create-attachment-files"
                    aria-label="Upload attachment files"
                    className="cursor-pointer"
                  >
                    <Upload className="h-4 w-4" />
                  </label>
                </Button>
              </div>

              {isCreateLinkComposerOpen ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                  <input
                    value={createLinkUrl}
                    onChange={(event) => setCreateLinkUrl(event.target.value)}
                    placeholder="https://..."
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={handleStageCreateLink}
                    disabled={!createLinkUrl.trim()}
                    aria-label="Confirm attachment link"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              {createAttachmentLinks.length > 0 ? (
                <div className="space-y-2">
                  {createAttachmentLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {link.url}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCreateLink(link.id)}
                        aria-label="Remove staged link"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {createSelectedFiles.length > 0 ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-background p-2">
                  {createSelectedFiles.map((file) => (
                    <p
                      key={`${file.name}-${file.size}`}
                      className="truncate text-[11px] text-muted-foreground"
                    >
                      <Paperclip className="mr-1 inline h-3 w-3" />
                      {file.name}
                    </p>
                  ))}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCreateSelectedFiles([]);
                      setCreateFileInputKey((previous) => previous + 1);
                    }}
                    aria-label="Clear selected files"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isCreatingCard}>
                {isCreatingCard ? "Creating..." : "Create card"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={closeCreateModal}
                disabled={isCreatingCard}
              >
                Cancel
              </Button>
            </div>
            {createError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {createError}
              </div>
            ) : null}
          </form>
        </ModalFrame>
      ) : null}

      {editingCard ? (
        <ModalFrame title="Edit context card" onClose={closeEditModal}>
          <form className="grid gap-4" onSubmit={(event) => void handleUpdateCardSubmit(event)}>
            <input type="hidden" name="cardId" value={editingCard.id} />
            <div className="grid gap-2">
              <label htmlFor="context-edit-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="context-edit-title"
                name="title"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editingCard.title}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="context-edit-content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="context-edit-content"
                name="content"
                rows={5}
                maxLength={4000}
                defaultValue={editingCard.content}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <ColorPicker selectedColor={editingColor} onSelect={setEditingColor} />
            <input type="hidden" name="color" value={editingColor} />

            <div className="space-y-2">
              {editingCardAttachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attachments yet.</p>
              ) : (
                <div className="space-y-2">
                  {editingCardAttachments.map((attachment) => {
                    const href = resolveAttachmentHref(attachment);
                    const canPreview = isAttachmentPreviewable(
                      attachment.kind,
                      attachment.mimeType
                    ) && Boolean(attachment.downloadUrl);

                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          {canPreview ? (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment(attachment)}
                              className="truncate text-left text-xs font-medium text-foreground underline underline-offset-2"
                              disabled={isSubmittingAttachment}
                            >
                              {attachment.name}
                            </button>
                          ) : href ? (
                            <a
                              href={href}
                              target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                              rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                              className="truncate text-xs font-medium text-foreground underline underline-offset-2"
                            >
                              {attachment.name}
                            </a>
                          ) : (
                            <p className="truncate text-xs font-medium text-foreground">
                              {attachment.name}
                            </p>
                          )}
                          {attachment.kind === ATTACHMENT_KIND_FILE ? (
                            <p className="text-[11px] text-muted-foreground">
                              {formatAttachmentFileSize(attachment.sizeBytes)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDeleteAttachment(attachment.id)}
                            disabled={isSubmittingAttachment}
                            aria-label="Delete attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={isEditLinkComposerOpen ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() =>
                    setIsEditLinkComposerOpen((previous) => !previous)
                  }
                  disabled={isSubmittingAttachment}
                  aria-label="Add attachment link"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
                <input
                  key={editFileInputKey}
                  id="context-edit-attachment-file"
                  type="file"
                  onChange={(event) =>
                    void handleAddFileAttachment(event.target.files?.[0] ?? null)
                  }
                  className="hidden"
                />
                <Button type="button" variant="ghost" size="icon" asChild disabled={isSubmittingAttachment}>
                  <label
                    htmlFor="context-edit-attachment-file"
                    aria-label="Upload attachment file"
                    className="cursor-pointer"
                  >
                    <Upload className="h-4 w-4" />
                  </label>
                </Button>
              </div>

              {isEditLinkComposerOpen ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                  <input
                    value={editLinkUrl}
                    onChange={(event) => setEditLinkUrl(event.target.value)}
                    placeholder="https://..."
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => void handleAddLinkAttachment()}
                    disabled={isSubmittingAttachment || !editLinkUrl.trim()}
                    aria-label="Confirm attachment link"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              {attachmentError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {attachmentError}
                </div>
              ) : null}
              {editError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {editError}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isUpdatingCard || isSubmittingAttachment}>
                {isUpdatingCard ? "Saving..." : "Save card"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={closeEditModal}
                disabled={isUpdatingCard || isSubmittingAttachment}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </Card>
  );
}
