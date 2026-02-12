"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Link2,
  Paperclip,
  Pencil,
  PlusSquare,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  formatAttachmentFileSize,
} from "@/lib/task-attachment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface ProjectContextPanelProps {
  projectId: string;
  cards: ProjectContextCard[];
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

function getRandomContextColor() {
  const index = Math.floor(Math.random() * CONTEXT_CARD_COLORS.length);
  return CONTEXT_CARD_COLORS[index];
}

function resolveAttachmentHref(attachment: ProjectContextAttachment): string | null {
  if (attachment.kind === ATTACHMENT_KIND_FILE) {
    return attachment.downloadUrl;
  }

  if (attachment.kind === ATTACHMENT_KIND_LINK) {
    return attachment.url;
  }

  return null;
}

async function readApiError(response: Response, fallbackMessage: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallbackMessage;
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
  createAction,
  updateAction,
  deleteAction,
}: ProjectContextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createColor, setCreateColor] = useState<string>(getRandomContextColor());
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>(CONTEXT_CARD_COLORS[0]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSubmittingAttachment, setIsSubmittingAttachment] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
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
    setAttachmentError(null);
    setLinkName("");
    setLinkUrl("");
    setFileLabel("");
    setSelectedFile(null);
    setFileInputKey((previous) => previous + 1);
  }, [editingCard]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:context-expanded`;
      const storedValue = window.localStorage.getItem(storageKey);

      if (storedValue === "1" || storedValue === "0") {
        setIsExpanded(storedValue === "1");
      }
    } catch (error) {
      console.error("[ProjectContextPanel.loadExpandedState]", error);
    }
  }, [projectId]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:context-expanded`;
      window.localStorage.setItem(storageKey, isExpanded ? "1" : "0");
    } catch (error) {
      console.error("[ProjectContextPanel.persistExpandedState]", error);
    }
  }, [isExpanded, projectId]);

  useEffect(() => {
    setCardAttachmentsById(
      Object.fromEntries(cards.map((card) => [card.id, card.attachments]))
    );
  }, [cards]);

  const openCreateModal = () => {
    setCreateColor(getRandomContextColor());
    setIsExpanded(true);
    setIsCreateOpen(true);
  };

  const handleAddLinkAttachment = async () => {
    if (!editingCard) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_LINK);
      formData.append("name", linkName.trim());
      formData.append("url", linkUrl.trim());

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
      setLinkName("");
      setLinkUrl("");
    } catch (error) {
      console.error("[ProjectContextPanel.handleAddLinkAttachment]", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not add link attachment."
      );
    } finally {
      setIsSubmittingAttachment(false);
    }
  };

  const handleAddFileAttachment = async () => {
    if (!editingCard || !selectedFile) {
      return;
    }

    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_FILE);
      formData.append("name", fileLabel.trim());
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
      setFileLabel("");
      setSelectedFile(null);
      setFileInputKey((previous) => previous + 1);
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
              Project context
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

                        <form action={deleteAction}>
                          <input type="hidden" name="cardId" value={card.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="text-slate-800 hover:bg-slate-900/10"
                            aria-label="Delete context card"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs text-slate-800">
                      {card.content || "No content."}
                    </p>

                    {attachments.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {previewAttachments.map((attachment) => {
                          const href = resolveAttachmentHref(attachment);
                          if (!href) {
                            return null;
                          }

                          return (
                            <a
                              key={attachment.id}
                              href={href}
                              target={attachment.kind === ATTACHMENT_KIND_LINK ? "_blank" : undefined}
                              rel={attachment.kind === ATTACHMENT_KIND_LINK ? "noreferrer" : undefined}
                              className="flex items-center gap-1 text-xs text-slate-900 underline underline-offset-2"
                            >
                              <Paperclip className="h-3 w-3" />
                              <span className="truncate">{attachment.name}</span>
                            </a>
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
        <ModalFrame title="Add context card" onClose={() => setIsCreateOpen(false)}>
          <form action={createAction} className="grid gap-4" onSubmit={() => setIsCreateOpen(false)}>
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

            <div className="flex items-center gap-2">
              <Button type="submit">Create card</Button>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {editingCard ? (
        <ModalFrame title="Edit context card" onClose={() => setEditingCardId(null)}>
          <form action={updateAction} className="grid gap-4" onSubmit={() => setEditingCardId(null)}>
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

            <div className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-medium">Attachments</p>

              {editingCardAttachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attachments yet.</p>
              ) : (
                <div className="space-y-2">
                  {editingCardAttachments.map((attachment) => {
                    const href = resolveAttachmentHref(attachment);

                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          {href ? (
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
                    );
                  })}
                </div>
              )}

              <div className="grid gap-2 rounded-md border border-border/60 bg-background p-2">
                <label className="text-xs font-medium">Add link</label>
                <input
                  value={linkName}
                  onChange={(event) => setLinkName(event.target.value)}
                  maxLength={120}
                  placeholder="Optional label"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://..."
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleAddLinkAttachment()}
                  disabled={isSubmittingAttachment || !linkUrl.trim()}
                >
                  <Link2 className="h-4 w-4" />
                  Add link
                </Button>
              </div>

              <div className="grid gap-2 rounded-md border border-border/60 bg-background p-2">
                <label className="text-xs font-medium">Upload file</label>
                <input
                  value={fileLabel}
                  onChange={(event) => setFileLabel(event.target.value)}
                  maxLength={120}
                  placeholder="Optional label"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
                <input
                  key={fileInputKey}
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleAddFileAttachment()}
                  disabled={isSubmittingAttachment || !selectedFile}
                >
                  <Upload className="h-4 w-4" />
                  Upload file
                </Button>
              </div>

              {attachmentError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
                  {attachmentError}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit">Save card</Button>
              <Button type="button" variant="ghost" onClick={() => setEditingCardId(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </Card>
  );
}
