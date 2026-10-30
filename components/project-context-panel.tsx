"use client";

import {
  useEffect,
  useCallback,
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
import type { MentionDisplayUser } from "@/components/ui/mention-hover-card";
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
  buildContextCardLivePayload,
  CONTEXT_CARD_LIVE_FIELDS,
  CONTEXT_CARD_LIVE_FIELD_META,
  EMPTY_CONTEXT_CARD_LIVE_DOCUMENT,
  toContextCardLiveDocument,
  validateContextCardLiveDocument,
  type ContextCardLiveDocument,
} from "@/components/context-panel/context-live-save";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_LABEL,
  normalizeAttachmentUrl,
} from "@/lib/task-attachment";
import {
  uploadFileAttachmentDirect,
  uploadFilesDirectInBackground,
} from "@/lib/direct-upload-client";
import {
  PROJECT_ACTIVITY_REMOTE_EVENT,
  fetchProjectActivityMutation,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";
import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { useLiveSave } from "@/lib/hooks/use-live-save";
import { recoveryDraftKey, useRecoveryDraft } from "@/lib/hooks/use-recovery-draft";
import { createContentSaveAdapter } from "@/lib/live-save/content-adapter";
import { isLiveSaveSurfaceEnabled } from "@/lib/live-save/rollout";
import type {
  LiveSaveAcceptedInfo,
  LiveSaveAdapter,
  LiveSaveOutcome,
} from "@/lib/live-save/types";
import { cn } from "@/lib/utils";

interface ProjectContextPanelProps {
  canEdit: boolean;
  projectId: string;
  actorUserId: string;
  storageProvider: "local" | "r2";
  cards: ProjectContextCard[];
  collaborators: MentionDisplayUser[];
}

type RemoteContextCardPayload = Omit<Partial<ProjectContextCard>, "attachments"> & {
  id: string;
  attachments?: Omit<ProjectContextAttachment, "downloadUrl">[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRemoteContextCardPayload(
  activity: ProjectActivityEventPayload
): RemoteContextCardPayload | null {
  if (!isRecord(activity.payload) || !isRecord(activity.payload.card)) {
    return null;
  }

  const card = activity.payload.card;
  if (typeof card.id !== "string") {
    return null;
  }

  return card as RemoteContextCardPayload;
}

function readRemoteContextCardId(
  activity: ProjectActivityEventPayload
): string | null {
  if (isRecord(activity.payload) && typeof activity.payload.cardId === "string") {
    return activity.payload.cardId;
  }

  return readRemoteContextCardPayload(activity)?.id ?? null;
}

function hasContextCardAttachments(
  card: RemoteContextCardPayload
): card is Omit<ProjectContextCard, "attachments"> & {
  attachments: Omit<ProjectContextAttachment, "downloadUrl">[];
} {
  return (
    typeof card.id === "string" &&
    typeof card.title === "string" &&
    typeof card.content === "string" &&
    typeof card.color === "string" &&
    Array.isArray(card.attachments)
  );
}

type RemoteContextCardResponsePayload = Omit<ProjectContextCard, "attachments"> & {
  attachments: Omit<ProjectContextAttachment, "downloadUrl">[];
};

function readRemoteContextCardResponse(
  value: unknown
): RemoteContextCardResponsePayload | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.contentRevision !== "number" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.color !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isRecord(value.projection) ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(
      (attachment) =>
        isRecord(attachment) &&
        typeof attachment.id === "string" &&
        typeof attachment.kind === "string" &&
        typeof attachment.name === "string"
    )
  ) {
    return null;
  }
  return value as unknown as RemoteContextCardResponsePayload;
}

export function ProjectContextPanel({
  canEdit,
  projectId,
  actorUserId,
  storageProvider,
  cards,
  collaborators,
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
  const [createTitle, setCreateTitle] = useState("");
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
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);
  const [editOrigin, setEditOrigin] = useState<ContextCardLiveDocument | null>(null);
  const [editOriginUnavailable, setEditOriginUnavailable] = useState(false);
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
  const createRecoveryValue = useMemo(() => ({
    title: createTitle, content: createContent, color: createColor,
    links: createAttachmentLinks, linkUrl: createLinkUrl,
  }), [createTitle, createContent, createColor, createAttachmentLinks, createLinkUrl]);
  const createRecoveryBase = useMemo(() => ({
    title: "", content: "", color: CONTEXT_CARD_COLORS[0],
    links: [] as PendingAttachmentLink[], linkUrl: "",
  }), []);
  const createRecovery = useRecoveryDraft({
    storageKey: isCreateOpen
      ? recoveryDraftKey({ userId: actorUserId, projectId, surface: "context-card", mode: "create" })
      : null,
    value: createRecoveryValue,
    base: createRecoveryBase,
    isEmpty: (draft) => !draft.title && !draft.content && !draft.links.length && !draft.linkUrl,
    restore: (draft) => {
      setCreateTitle(draft.title);
      setCreateContent(draft.content);
      setCreateColor(draft.color);
      setCreateAttachmentLinks(draft.links);
      setCreateLinkUrl(draft.linkUrl);
      setIsCreateLinkComposerOpen(Boolean(draft.linkUrl));
    },
  });
  const editRecoveryValue = useMemo(() => ({
    title: editTitle, content: editContent, color: editingColor,
  }), [editTitle, editContent, editingColor]);
  const editRecoveryBase = useMemo(() => ({
    title: editingCard?.title ?? "",
    content: editingCard?.content ?? "",
    color: editingCard?.color ?? CONTEXT_CARD_COLORS[0],
  }), [editingCard]);
  const editRecovery = useRecoveryDraft({
    storageKey: editingCard
      ? recoveryDraftKey({
          userId: actorUserId, projectId, surface: "context-card",
          mode: "edit", entityId: editingCard.id,
        })
      : null,
    value: editRecoveryValue,
    base: editRecoveryBase,
    baseRevision: editingCard ? String(editingCard.contentRevision) : null,
    restore: (draft, origin) => {
      setEditTitle(draft.title);
      setEditContent(draft.content);
      setEditingColor(draft.color);
      const revision = origin?.baseRevision;
      const knownRevision = revision !== null && revision !== undefined && /^\d+$/.test(revision);
      const sameBase = origin && JSON.stringify(origin.base) === JSON.stringify(editRecoveryBase);
      setEditOriginUnavailable(!knownRevision && !sameBase);
      if (editingCard && origin && knownRevision) {
        setEditOrigin({
          ...toContextCardLiveDocument(editingCard),
          ...origin.base,
          contentRevision: Number(revision),
        });
      }
    },
  });

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

  const withDownloadUrls = useCallback((
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
  }), [projectId]);

  const readLiveContextCard = useCallback(
    (value: unknown): ProjectContextCard | null => {
      const payload = readRemoteContextCardResponse(value);
      if (!payload) {
        return null;
      }
      const card = withDownloadUrls(payload);
      return {
        ...card,
        content: normalizeContextCardContentHtml(card.content),
      };
    },
    [withDownloadUrls]
  );

  const editLiveBase = useMemo<ContextCardLiveDocument>(
    () =>
      editOrigin ?? (editingCard
        ? toContextCardLiveDocument(editingCard)
        : EMPTY_CONTEXT_CARD_LIVE_DOCUMENT),
    [editingCard, editOrigin]
  );
  const editLiveValue = useMemo<ContextCardLiveDocument>(() => {
    if (!editingCard) {
      return editLiveBase;
    }
    return {
      title: editTitle,
      content: normalizeContextCardContentHtml(editContent),
      color: editingColor,
      contentRevision: editingCard.contentRevision,
      card: editingCard,
    };
  }, [editContent, editLiveBase, editTitle, editingCard, editingColor]);
  const editLiveAdapter = useMemo<LiveSaveAdapter<ContextCardLiveDocument>>(() => {
    if (!editingCard) {
      return { save: async () => ({ kind: "gone" }) };
    }
    const cardId = editingCard.id;
    return createContentSaveAdapter<ContextCardLiveDocument>({
      projectId,
      domain: "context-card",
      entityId: cardId,
      url: `/api/projects/${projectId}/context-cards/${cardId}`,
      buildPayload: (fields) =>
        buildContextCardLivePayload(
          { title: editTitle, content: editContent, color: editingColor },
          fields
        ),
      mapAccepted: (body) => {
        if (!isRecord(body)) return null;
        const card = readLiveContextCard(body.card);
        if (!card) return null;
        return {
          representation: toContextCardLiveDocument(card),
          revision: card.contentRevision,
        };
      },
      mapConflict: (body) => {
        if (!isRecord(body) || body.error !== "edit-conflict") return null;
        const card = readLiveContextCard(body.current);
        if (!card) return null;
        setLocalCards((previous) => previous.map((entry) => entry.id === card.id ? card : entry));
        return {
          representation: toContextCardLiveDocument(card),
          revision: card.contentRevision,
        };
      },
    });
  }, [
    editContent,
    editingCard,
    editTitle,
    editingColor,
    projectId,
    readLiveContextCard,
  ]);
  const applyEditLiveRepresentation = useCallback(
    (representation: ContextCardLiveDocument, fields: string[]) => {
      // Use the document fields: during conflict resolution the scheduler
      // merges per field, while the embedded `card` stays at the latest
      // server snapshot.
      if (fields.includes("title")) {
        setEditTitle(representation.title);
      }
      if (fields.includes("content")) {
        setEditContent(normalizeContextCardContentHtml(representation.content));
      }
      if (fields.includes("color")) {
        setEditingColor(representation.color);
      }
    },
    []
  );
  const editLiveLastAcceptedRef = useRef<{ fullySynced: boolean } | null>(null);
  const editRecoveryBaseAckRef = useRef(false);
  const handleEditLiveAccepted = useCallback(
    (info: LiveSaveAcceptedInfo<ContextCardLiveDocument>) => {
      const acceptedCard = info.representation.card;
      if (!acceptedCard) {
        return;
      }
      editLiveLastAcceptedRef.current = { fullySynced: info.fullySynced };
      if (info.fullySynced) {
        editRecoveryBaseAckRef.current = true;
      }
      setLocalCards((previous) =>
        previous.map((card) =>
          card.id === acceptedCard.id ? acceptedCard : card
        )
      );
      setCardAttachmentsById((previous) => ({
        ...previous,
        [acceptedCard.id]: acceptedCard.attachments,
      }));
    },
    []
  );
  const editLive = useLiveSave<ContextCardLiveDocument>({
    adapter: editLiveAdapter,
    value: editLiveValue,
    base: editLiveBase,
    baseRevision: editLiveBase.contentRevision,
    fields: CONTEXT_CARD_LIVE_FIELDS,
    fieldMeta: CONTEXT_CARD_LIVE_FIELD_META,
    enabled:
      canEdit &&
      editingCard !== null &&
      !editRecovery.conflict &&
      isLiveSaveSurfaceEnabled("context-card"),
    // Restoring an older edit starts from that edit's original baseline. It
    // must not be treated as a new remote update to the freshly opened form.
    entityKey: editingCard ? `${editingCard.id}:${editLiveBase.contentRevision}` : null,
    validate: validateContextCardLiveDocument,
    applyRepresentation: applyEditLiveRepresentation,
    onAccepted: handleEditLiveAccepted,
  });
  useEffect(() => {
    if (!editRecoveryBaseAckRef.current) {
      return;
    }
    editRecoveryBaseAckRef.current = false;
    editRecovery.acceptConflict();
  }, [editRecovery, editingCard]);

  useEffect(() => {
    const handleProjectActivity = (event: Event) => {
      const { activity, markHandled } = (
        event as CustomEvent<ProjectActivityRemoteEventDetail>
      ).detail;

      if (activity.projectId !== projectId || activity.domain !== "context-card") {
        return;
      }

      if (activity.action === "deleted") {
        const cardId = readRemoteContextCardId(activity);
        if (!cardId) {
          return;
        }

        setLocalCards((previous) => previous.filter((card) => card.id !== cardId));
        setCardAttachmentsById((previous) => {
          const next = { ...previous };
          delete next[cardId];
          return next;
        });
        setEditingCardId((current) => (current === cardId ? null : current));
        setPreviewCardId((current) => (current === cardId ? null : current));
        setPendingDeleteCardId((current) => (current === cardId ? null : current));
        markHandled();
        return;
      }

      const remoteCard = readRemoteContextCardPayload(activity);
      if (!remoteCard?.id) {
        return;
      }

      if (activity.action === "created") {
        if (!hasContextCardAttachments(remoteCard)) {
          return;
        }

        const nextCard = {
          ...withDownloadUrls(remoteCard),
          content: normalizeContextCardContentHtml(remoteCard.content),
        };

        setLocalCards((previous) => [
          nextCard,
          ...previous.filter((card) => card.id !== nextCard.id),
        ]);
        setCardAttachmentsById((previous) => ({
          ...previous,
          [nextCard.id]: nextCard.attachments,
        }));
        setIsExpanded(true);
        markHandled();
        return;
      }

      if (activity.action === "updated") {
        const remoteCardId = remoteCard.id;
        setLocalCards((previous) =>
          previous.map((card) =>
            card.id === remoteCardId
              ? {
                  ...card,
                  title:
                    typeof remoteCard.title === "string"
                      ? remoteCard.title
                      : card.title,
                  content:
                    typeof remoteCard.content === "string"
                      ? normalizeContextCardContentHtml(remoteCard.content)
                      : card.content,
                  color:
                    typeof remoteCard.color === "string"
                      ? remoteCard.color
                      : card.color,
                  contentRevision:
                    typeof remoteCard.contentRevision === "number"
                      ? remoteCard.contentRevision
                      : card.contentRevision,
                  updatedAt:
                    typeof remoteCard.updatedAt === "string"
                      ? remoteCard.updatedAt
                      : card.updatedAt,
                  projection: remoteCard.projection
                    ? {
                        ...card.projection,
                        ...remoteCard.projection,
                      }
                    : card.projection,
                }
              : card
          )
        );
        if (Array.isArray(remoteCard.attachments)) {
          setCardAttachmentsById((previous) => ({
            ...previous,
            [remoteCardId]: withDownloadUrls(
              remoteCard as Omit<ProjectContextCard, "attachments"> & {
                attachments: Omit<ProjectContextAttachment, "downloadUrl">[];
              }
            ).attachments,
          }));
        }
        markHandled();
      }
    };

    window.addEventListener(PROJECT_ACTIVITY_REMOTE_EVENT, handleProjectActivity);

    return () => {
      window.removeEventListener(
        PROJECT_ACTIVITY_REMOTE_EVENT,
        handleProjectActivity
      );
    };
  }, [projectId, setIsExpanded, withDownloadUrls]);

  const resetCreateAttachmentDraft = () => {
    setCreateTitle("");
    setCreateContent("");
    setCreateLinkUrl("");
    setIsCreateLinkComposerOpen(false);
    setCreateAttachmentLinks([]);
    setCreateSelectedFiles([]);
    setCreateFileInputKey((previous) => previous + 1);
  };

  const closeCreateModal = () => {
    createRecovery.flush();
    resetCreateAttachmentDraft();
    setCreateError(null);
    setIsCreateOpen(false);
  };

  const openCreateModal = () => {
    if (!canEdit || isCreatingCard) {
      return;
    }

    resetCreateAttachmentDraft();
    setCreateColor(getRandomContextColor());
    setCreateError(null);
    setIsExpanded(true);
    setIsCreateOpen(true);
  };

  const closeEditModal = () => {
    editRecovery.flush();
    setEditingCardId(null);
    setEditOrigin(null);
    setEditOriginUnavailable(false);
    setEditTitle("");
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
    setEditOrigin(toContextCardLiveDocument(cardToEdit));
    setEditOriginUnavailable(false);
    setEditingColor(cardToEdit.color);
    setEditTitle(cardToEdit.title);
    setEditContent(normalizeContextCardContentHtml(cardToEdit.content));
    setEditError(null);
    setAttachmentError(null);
    setIsEditLinkComposerOpen(false);
    setEditLinkUrl("");
    setEditFileInputKey((previous) => previous + 1);
    setPreviewAttachment(null);
    setEditingCardId(cardId);
  };

  const handleStageCreateLink = (urlOverride?: string) => {
    const rawUrl = typeof urlOverride === "string" ? urlOverride : createLinkUrl;
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return;
    }

    const normalizedUrl = normalizeAttachmentUrl(trimmed) || trimmed;
    setCreateAttachmentLinks((previous) => [
      {
        id: createLocalId(),
        url: normalizedUrl,
      },
      ...previous,
    ]);
    setCreateLinkUrl("");
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
    const submittedRecovery = createRecoveryValue;
    createRecovery.flush();

    const formData = new FormData(event.currentTarget);
    const optimisticCardId = `optimistic-context-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const optimisticTitle =
      formData.get("title")?.toString().trim() || "Untitled context";
    const optimisticContent =
      formData.get("content")?.toString().trim() || createContent;
    const optimisticColor =
      formData.get("color")?.toString().trim() || createColor;
    const pendingUrl = createLinkUrl.trim();
    const normalizedPendingUrl = pendingUrl ? (normalizeAttachmentUrl(pendingUrl) || pendingUrl) : null;
    const effectiveLinks =
      normalizedPendingUrl && !createAttachmentLinks.some((l) => l.url === normalizedPendingUrl)
        ? [{ id: createLocalId(), url: normalizedPendingUrl }, ...createAttachmentLinks]
        : createAttachmentLinks;

    if (effectiveLinks !== createAttachmentLinks) {
      formData.set(
        "attachmentLinks",
        JSON.stringify(effectiveLinks.map((l) => ({ name: "", url: l.url })))
      );
    }

    const optimisticAttachments: ProjectContextAttachment[] =
      effectiveLinks.map((link) => ({
        id: `optimistic-context-link-${link.id}`,
        kind: ATTACHMENT_KIND_LINK,
        name: "",
        url: link.url,
        mimeType: null,
        sizeBytes: null,
        downloadUrl: null,
      }));
    const filesForBackgroundUpload =
      storageProvider === "r2" ? [...createSelectedFiles] : [];

    if (storageProvider === "r2") {
      formData.delete("attachmentFiles");
    }

    closeCreateModal();
    const optimisticNow = new Date().toISOString();
    setLocalCards((previous) => [
      {
        id: optimisticCardId,
        contentRevision: 0,
        title: optimisticTitle,
        content: normalizeContextCardContentHtml(optimisticContent),
        color: optimisticColor,
        createdAt: optimisticNow,
        updatedAt: optimisticNow,
        attachments: optimisticAttachments,
        projection: {
          id: optimisticCardId,
          creator: null,
          lastEditor: null,
          attachments: [],
        },
      },
      ...previous,
    ]);
    setCardAttachmentsById((previous) => ({
      ...previous,
      [optimisticCardId]: optimisticAttachments,
    }));

    void (async () => {
      try {
        const response = await fetchProjectActivityMutation(
          projectId,
          `/api/projects/${projectId}/context-cards`,
          {
            method: "POST",
            body: formData,
          }
        );

        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              cardId?: string;
              card?: Omit<ProjectContextCard, "attachments"> & {
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
          setLocalCards((previous) =>
            previous.filter((card) => card.id !== optimisticCardId)
          );
          setCardAttachmentsById((previous) => {
            const next = { ...previous };
            delete next[optimisticCardId];
            return next;
          });
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
        createRecovery.saved(submittedRecovery);
        const createdCardId =
          payload && typeof payload.cardId === "string" ? payload.cardId : null;
        const createdCard =
          payload?.card && typeof payload.card.id === "string"
            ? withDownloadUrls(payload.card)
            : null;

        if (createdCard) {
          setPreviewCardId((current) =>
            current === optimisticCardId ? createdCard.id : current
          );
          setLocalCards((previous) => [
            {
              ...createdCard,
              content: normalizeContextCardContentHtml(createdCard.content),
            },
            ...previous.filter((card) => card.id !== optimisticCardId),
          ]);
          setCardAttachmentsById((previous) => ({
            ...Object.fromEntries(
              Object.entries(previous).filter(([cardId]) => cardId !== optimisticCardId)
            ),
            [createdCard.id]: createdCard.attachments,
          }));
        }

        pushToast({
          variant: "success",
          message: "Context card created.",
        });

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
        setLocalCards((previous) =>
          previous.filter((card) => card.id !== optimisticCardId)
        );
        setCardAttachmentsById((previous) => {
          const next = { ...previous };
          delete next[optimisticCardId];
          return next;
        });
        setCreateError(message);
        pushToast({
          variant: "error",
          message,
        });
      } finally {
        if (isMountedRef.current) setIsCreatingCard(false);
      }
    })();
  };

  const mapContextLiveSaveOutcome = (
    outcome: LiveSaveOutcome<ContextCardLiveDocument>
  ): string | null => {
    switch (outcome.status) {
      case "accepted":
      case "adopted":
      case "clean":
        return null;
      case "conflict":
        return "This context card changed elsewhere. Please cancel and reopen it before trying again.";
      case "invalid":
        return mapContextMutationError(
          outcome.message,
          "Could not update context card. Please retry."
        );
      case "unauthorized":
        return "You no longer have permission to edit this context card.";
      case "gone":
        return "This context card is no longer available.";
      case "offline":
        return "You're offline. Please try again when the connection returns.";
      case "failed":
        return mapContextMutationError(
          outcome.message,
          "Could not update context card. Please retry."
        );
      case "busy":
        return "A save is already in progress. Try again.";
      case "disabled":
        return "Could not save this card. Please try again.";
    }
  };

  const isEditLiveFullySynced = (
    outcome: LiveSaveOutcome<ContextCardLiveDocument>
  ): boolean =>
    outcome.status === "clean" ||
    outcome.status === "adopted" ||
    (editLiveLastAcceptedRef.current?.fullySynced ?? true);

  const handleUpdateCardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCard || isUpdatingCard) {
      return;
    }
    if (editOriginUnavailable) {
      setEditError("Could not save this card because it changed elsewhere. Please cancel and reopen it.");
      return;
    }
    if (editLive.snapshot.conflict) {
      setEditError(
        "This context card changed elsewhere. Please cancel and reopen it before trying again."
      );
      return;
    }

    const submittedRecovery = editRecoveryValue;
    setIsUpdatingCard(true);
    setEditError(null);
    editLiveLastAcceptedRef.current = null;

    try {
      // Explicit Save runs through the guarded revision path: one conditional
      // partial PATCH carrying only the fields the user changed. Creation and
      // attachments stay on their own explicit routes.
      const outcome = await editLive.saveNow();
      const message = mapContextLiveSaveOutcome(outcome);
      if (message !== null) {
        setEditError(message);
        return;
      }
      if (!isEditLiveFullySynced(outcome)) {
        return;
      }
      editRecovery.saved(submittedRecovery);
      closeEditModal();
      pushToast({
        variant: "success",
        message: "Context card saved.",
      });
    } catch (error) {
      console.error("[ProjectContextPanel.handleUpdateCardSubmit]", error);
      setEditError("Could not update context card. Please retry.");
    } finally {
      setIsUpdatingCard(false);
    }
  };

  const requestDeleteCard = (cardId: string) => {
    if (!canEdit) {
      return;
    }

    // Close the preview before the confirmation opens so dialogs never stack
    // (same pattern as task deletion from the task detail modal).
    setPreviewCardId(null);
    setPendingDeleteCardId(cardId);
  };

  const handleDeleteCard = async () => {
    if (!pendingDeleteCardId) {
      return;
    }

    const cardId = pendingDeleteCardId;
    const cardToDelete = localCards.find((card) => card.id === cardId) ?? null;
    const attachmentsToRestore = cardAttachmentsById[cardId] ?? cardToDelete?.attachments ?? [];
    if (deletingCardId) {
      return;
    }

    setDeletingCardId(cardId);
    setLocalCards((previous) => previous.filter((card) => card.id !== cardId));
    setCardAttachmentsById((previous) => {
      const next = { ...previous };
      delete next[cardId];
      return next;
    });
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/context-cards/${cardId}`,
        {
          method: "DELETE",
        }
      );

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
        if (cardToDelete) {
          setLocalCards((previous) => [cardToDelete, ...previous]);
          setCardAttachmentsById((previous) => ({
            ...previous,
            [cardId]: attachmentsToRestore,
          }));
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
      pushToast({
        variant: "success",
        message: "Context card deleted.",
      });
    } catch (error) {
      console.error("[ProjectContextPanel.handleDeleteCard]", error);
      const message = "Could not delete context card. Please retry.";
      if (editingCardId === cardId) {
        setEditError(message);
      }
      if (cardToDelete) {
        setLocalCards((previous) => [cardToDelete, ...previous]);
        setCardAttachmentsById((previous) => ({
          ...previous,
          [cardId]: attachmentsToRestore,
        }));
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

  const handleAddLinkAttachment = async (urlOverride?: string) => {
    const rawUrl = typeof urlOverride === "string" ? urlOverride : editLinkUrl;
    const trimmed = rawUrl.trim();
    if (!editingCard || !trimmed) {
      return;
    }

    const normalizedUrl = normalizeAttachmentUrl(trimmed) || trimmed;
    setIsSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      const formData = new FormData();
      formData.append("kind", ATTACHMENT_KIND_LINK);
      formData.append("name", "");
      formData.append("url", normalizedUrl);

      const response = await fetchProjectActivityMutation(
        projectId,
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

        const response = await fetchProjectActivityMutation(
          projectId,
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
      const response = await fetchProjectActivityMutation(
        projectId,
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
    <Card
      className={PROJECT_SECTION_CARD_CLASS}
      data-project-live-refresh-lock={
        isCreateOpen ||
        isCreatingCard ||
        Boolean(editingCard) ||
        isUpdatingCard ||
        isSubmittingAttachment ||
        Boolean(pendingDeleteCardId)
          ? "true"
          : undefined
      }
    >
      <CardHeader
        className={cn(
          `space-y-3 ${PROJECT_SECTION_HEADER_CLASS} px-5 pt-5`,
          isExpanded ? "pb-4" : "pb-3"
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-w-0 w-full flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-muted/40"
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
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground sm:ml-auto">
              {localCards.length} card{localCards.length === 1 ? "" : "s"}
            </span>
          </button>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="h-10 w-full rounded-full px-4 sm:w-auto"
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
              mentionUsers={collaborators}
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
        mentionProjectId={projectId}
        createColor={createColor}
        createTitle={createTitle}
        onCancel={() => {
          createRecovery.discard();
          resetCreateAttachmentDraft();
          setCreateColor(CONTEXT_CARD_COLORS[0]);
          setCreateError(null);
          closeCreateModal();
        }}
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
        onCreateTitleChange={setCreateTitle}
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
        editTitle={editTitle}
        onCancel={() => {
          editRecovery.discard();
          setEditTitle(editingCard?.title ?? "");
          setEditContent(editingCard?.content ?? "");
          setEditingColor(editingCard?.color ?? CONTEXT_CARD_COLORS[0]);
          setEditError(null);
          closeEditModal();
        }}
        mentionProjectId={projectId}
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
        onEditTitleChange={setEditTitle}
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
        mentionUsers={collaborators}
        onClose={() => setPreviewCardId(null)}
        onEdit={openEditModal}
        onDelete={requestDeleteCard}
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
