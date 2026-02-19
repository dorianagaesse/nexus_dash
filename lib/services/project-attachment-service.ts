import {
  createAttachmentSignedUploadUrl,
  deleteAttachmentFile,
  getAttachmentDownloadUrl,
  readAttachmentFile,
  readAttachmentStoredFileMetadata,
  saveAttachmentFile,
} from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
  DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
  isAllowedAttachmentMimeType,
  isAttachmentKind,
  MAX_ATTACHMENT_FILE_SIZE_LABEL,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  normalizeAttachmentUrl,
} from "@/lib/task-attachment";
import { logServerError } from "@/lib/observability/logger";
import { isAttachmentStorageUnavailableError } from "@/lib/storage/errors";

import type { ParsedAttachmentLink } from "@/lib/services/attachment-input-service";

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export interface AttachmentResponsePayload {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface AttachmentDownloadPayload {
  mode: "proxy" | "redirect";
  contentType?: string;
  contentDisposition?: string;
  content?: Uint8Array;
  redirectUrl?: string;
}

export interface AttachmentDirectUploadTargetPayload {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxFileSizeBytes: number;
  maxFileSizeLabel: string;
}

interface DirectUploadInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeDirectUploadInput(
  input: DirectUploadInput
): ServiceResult<{
  name: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const normalizedName = input.name.trim() || "file";
  const normalizedMimeType = input.mimeType.trim();

  if (!isPositiveFiniteNumber(input.sizeBytes)) {
    return createError(400, "File is empty");
  }

  if (input.sizeBytes > DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES) {
    return createError(
      400,
      `File exceeds ${DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`
    );
  }

  if (!isAllowedAttachmentMimeType(normalizedMimeType)) {
    return createError(
      400,
      "Unsupported file type. Use PDF, image, text, CSV, or JSON."
    );
  }

  return {
    ok: true,
    data: {
      name: normalizedName,
      mimeType: normalizedMimeType,
      sizeBytes: input.sizeBytes,
    },
  };
}

function hasExpectedStoragePrefix(
  storageKey: string,
  scope: "task" | "context-card",
  ownerId: string
): boolean {
  return storageKey.startsWith(`${scope}/${ownerId}/`);
}

function getAttachmentUploadErrorMessage(error: unknown): string {
  if (isAttachmentStorageUnavailableError(error)) {
    return "Attachment storage is not configured for this environment. Configure STORAGE_PROVIDER=r2 and R2 credentials, then redeploy.";
  }

  return "Failed to upload attachment";
}

function withTaskDownloadUrl(
  projectId: string,
  taskId: string,
  attachment: {
    id: string;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }
): AttachmentResponsePayload {
  return {
    ...attachment,
    downloadUrl:
      attachment.kind === ATTACHMENT_KIND_FILE
        ? `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/download`
        : null,
  };
}

function withContextDownloadUrl(
  projectId: string,
  cardId: string,
  attachment: {
    id: string;
    kind: string;
    name: string;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }
): AttachmentResponsePayload {
  return {
    ...attachment,
    downloadUrl:
      attachment.kind === ATTACHMENT_KIND_FILE
        ? `/api/projects/${projectId}/context-cards/${cardId}/attachments/${attachment.id}/download`
        : null,
  };
}

export async function createTaskAttachmentsFromDraft(input: {
  taskId: string;
  links: ParsedAttachmentLink[];
  files: File[];
}): Promise<void> {
  const savedStorageKeys: string[] = [];

  try {
    if (input.links.length > 0) {
      await prisma.taskAttachment.createMany({
        data: input.links.map((link) => ({
          taskId: input.taskId,
          kind: ATTACHMENT_KIND_LINK,
          name: link.name,
          url: link.url,
        })),
      });
    }

    for (const file of input.files) {
      const storedFile = await saveAttachmentFile({
        scope: "task",
        ownerId: input.taskId,
        file,
      });
      savedStorageKeys.push(storedFile.storageKey);

      await prisma.taskAttachment.create({
        data: {
          taskId: input.taskId,
          kind: ATTACHMENT_KIND_FILE,
          name: storedFile.originalName,
          storageKey: storedFile.storageKey,
          mimeType: storedFile.mimeType,
          sizeBytes: storedFile.sizeBytes,
        },
      });
    }
  } catch (error) {
    await Promise.all(
      savedStorageKeys.map((storageKey) =>
        deleteAttachmentFile(storageKey).catch((cleanupError) => {
          logServerError("createTaskAttachmentsFromDraft.cleanup", cleanupError);
        })
      )
    );
    throw error;
  }
}

export async function createContextAttachmentsFromDraft(input: {
  cardId: string;
  links: ParsedAttachmentLink[];
  files: File[];
}): Promise<void> {
  const savedStorageKeys: string[] = [];

  try {
    if (input.links.length > 0) {
      await prisma.resourceAttachment.createMany({
        data: input.links.map((link) => ({
          resourceId: input.cardId,
          kind: ATTACHMENT_KIND_LINK,
          name: link.name,
          url: link.url,
        })),
      });
    }

    for (const file of input.files) {
      const storedFile = await saveAttachmentFile({
        scope: "context-card",
        ownerId: input.cardId,
        file,
      });
      savedStorageKeys.push(storedFile.storageKey);

      await prisma.resourceAttachment.create({
        data: {
          resourceId: input.cardId,
          kind: ATTACHMENT_KIND_FILE,
          name: storedFile.originalName,
          storageKey: storedFile.storageKey,
          mimeType: storedFile.mimeType,
          sizeBytes: storedFile.sizeBytes,
        },
      });
    }
  } catch (error) {
    await Promise.all(
      savedStorageKeys.map((storageKey) =>
        deleteAttachmentFile(storageKey).catch((cleanupError) => {
          logServerError(
            "createContextAttachmentsFromDraft.cleanup",
            cleanupError
          );
        })
      )
    );
    throw error;
  }
}

export async function createTaskAttachmentFromForm(input: {
  projectId: string;
  taskId: string;
  formData: FormData;
}): Promise<ServiceResult<AttachmentResponsePayload>> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, projectId: true },
  });

  if (!task || task.projectId !== input.projectId) {
    return createError(404, "Task not found");
  }

  const kind = readText(input.formData, "kind");

  if (!isAttachmentKind(kind)) {
    return createError(400, "Invalid attachment kind");
  }

  if (kind === ATTACHMENT_KIND_LINK) {
    const rawUrl = readText(input.formData, "url");
    const normalizedUrl = normalizeAttachmentUrl(rawUrl);
    const providedName = readText(input.formData, "name");

    if (!normalizedUrl) {
      return createError(400, "Invalid link URL");
    }

    try {
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: input.taskId,
          kind: ATTACHMENT_KIND_LINK,
          name: providedName || new URL(normalizedUrl).hostname,
          url: normalizedUrl,
        },
        select: {
          id: true,
          kind: true,
          name: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      return {
        ok: true,
        data: withTaskDownloadUrl(input.projectId, input.taskId, attachment),
      };
    } catch (error) {
      logServerError("createTaskAttachmentFromForm.link", error);
      return createError(500, "Failed to create attachment");
    }
  }

  const fileEntry = input.formData.get("file");

  if (!(fileEntry instanceof File)) {
    return createError(400, "Missing file");
  }

  if (fileEntry.size <= 0) {
    return createError(400, "File is empty");
  }

  if (fileEntry.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
    return createError(400, `File exceeds ${MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`);
  }

  if (!isAllowedAttachmentMimeType(fileEntry.type)) {
    return createError(
      400,
      "Unsupported file type. Use PDF, image, text, CSV, or JSON."
    );
  }

  const providedName = readText(input.formData, "name");
  let storageKey: string | null = null;

  try {
    const storedFile = await saveAttachmentFile({
      scope: "task",
      ownerId: input.taskId,
      file: fileEntry,
    });
    storageKey = storedFile.storageKey;

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: input.taskId,
        kind: ATTACHMENT_KIND_FILE,
        name: providedName || storedFile.originalName,
        storageKey: storedFile.storageKey,
        mimeType: storedFile.mimeType,
        sizeBytes: storedFile.sizeBytes,
      },
      select: {
        id: true,
        kind: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    return {
      ok: true,
      data: withTaskDownloadUrl(input.projectId, input.taskId, attachment),
    };
  } catch (error) {
    if (storageKey) {
      await deleteAttachmentFile(storageKey).catch((cleanupError) => {
        logServerError("createTaskAttachmentFromForm.cleanup", cleanupError);
      });
    }

    logServerError("createTaskAttachmentFromForm.file", error);
    return createError(500, getAttachmentUploadErrorMessage(error));
  }
}

export async function createContextAttachmentFromForm(input: {
  projectId: string;
  cardId: string;
  formData: FormData;
}): Promise<ServiceResult<AttachmentResponsePayload>> {
  const card = await prisma.resource.findUnique({
    where: { id: input.cardId },
    select: { id: true, projectId: true, type: true },
  });

  if (
    !card ||
    card.projectId !== input.projectId ||
    card.type !== RESOURCE_TYPE_CONTEXT_CARD
  ) {
    return createError(404, "Context card not found");
  }

  const kind = readText(input.formData, "kind");

  if (!isAttachmentKind(kind)) {
    return createError(400, "Invalid attachment kind");
  }

  if (kind === ATTACHMENT_KIND_LINK) {
    const rawUrl = readText(input.formData, "url");
    const normalizedUrl = normalizeAttachmentUrl(rawUrl);
    const providedName = readText(input.formData, "name");

    if (!normalizedUrl) {
      return createError(400, "Invalid link URL");
    }

    try {
      const attachment = await prisma.resourceAttachment.create({
        data: {
          resourceId: input.cardId,
          kind: ATTACHMENT_KIND_LINK,
          name: providedName || new URL(normalizedUrl).hostname,
          url: normalizedUrl,
        },
        select: {
          id: true,
          kind: true,
          name: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      return {
        ok: true,
        data: withContextDownloadUrl(input.projectId, input.cardId, attachment),
      };
    } catch (error) {
      logServerError("createContextAttachmentFromForm.link", error);
      return createError(500, "Failed to create attachment");
    }
  }

  const fileEntry = input.formData.get("file");

  if (!(fileEntry instanceof File)) {
    return createError(400, "Missing file");
  }

  if (fileEntry.size <= 0) {
    return createError(400, "File is empty");
  }

  if (fileEntry.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
    return createError(400, `File exceeds ${MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`);
  }

  if (!isAllowedAttachmentMimeType(fileEntry.type)) {
    return createError(
      400,
      "Unsupported file type. Use PDF, image, text, CSV, or JSON."
    );
  }

  const providedName = readText(input.formData, "name");
  let storageKey: string | null = null;

  try {
    const storedFile = await saveAttachmentFile({
      scope: "context-card",
      ownerId: input.cardId,
      file: fileEntry,
    });
    storageKey = storedFile.storageKey;

    const attachment = await prisma.resourceAttachment.create({
      data: {
        resourceId: input.cardId,
        kind: ATTACHMENT_KIND_FILE,
        name: providedName || storedFile.originalName,
        storageKey: storedFile.storageKey,
        mimeType: storedFile.mimeType,
        sizeBytes: storedFile.sizeBytes,
      },
      select: {
        id: true,
        kind: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    return {
      ok: true,
      data: withContextDownloadUrl(input.projectId, input.cardId, attachment),
    };
  } catch (error) {
    if (storageKey) {
      await deleteAttachmentFile(storageKey).catch((cleanupError) => {
        logServerError("createContextAttachmentFromForm.cleanup", cleanupError);
      });
    }

    logServerError("createContextAttachmentFromForm.file", error);
    return createError(500, getAttachmentUploadErrorMessage(error));
  }
}

export async function createTaskAttachmentUploadTarget(input: {
  projectId: string;
  taskId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ServiceResult<{ upload: AttachmentDirectUploadTargetPayload }>> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, projectId: true },
  });

  if (!task || task.projectId !== input.projectId) {
    return createError(404, "Task not found");
  }

  const normalizedUpload = normalizeDirectUploadInput({
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!normalizedUpload.ok) {
    return normalizedUpload;
  }

  try {
    const signedUpload = await createAttachmentSignedUploadUrl({
      scope: "task",
      ownerId: input.taskId,
      originalName: normalizedUpload.data.name,
      mimeType: normalizedUpload.data.mimeType,
      sizeBytes: normalizedUpload.data.sizeBytes,
    });

    if (!signedUpload) {
      return createError(
        400,
        "Direct upload is not available for the current storage provider."
      );
    }

    return {
      ok: true,
      data: {
        upload: {
          ...signedUpload,
          maxFileSizeBytes: DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
          maxFileSizeLabel: DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
        },
      },
    };
  } catch (error) {
    logServerError("createTaskAttachmentUploadTarget", error);
    return createError(500, getAttachmentUploadErrorMessage(error));
  }
}

export async function finalizeTaskAttachmentDirectUpload(input: {
  projectId: string;
  taskId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ServiceResult<AttachmentResponsePayload>> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, projectId: true },
  });

  if (!task || task.projectId !== input.projectId) {
    return createError(404, "Task not found");
  }

  const normalizedStorageKey = input.storageKey.trim();
  if (!hasExpectedStoragePrefix(normalizedStorageKey, "task", input.taskId)) {
    return createError(400, "Invalid storage key");
  }

  const normalizedUpload = normalizeDirectUploadInput({
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!normalizedUpload.ok) {
    return normalizedUpload;
  }

  try {
    const metadata = await readAttachmentStoredFileMetadata(normalizedStorageKey);
    if (!metadata) {
      return createError(404, "Uploaded file not found");
    }

    const resolvedSizeBytes = metadata.sizeBytes ?? normalizedUpload.data.sizeBytes;
    const resolvedMimeType = metadata.mimeType ?? normalizedUpload.data.mimeType;

    if (resolvedSizeBytes <= 0) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeTaskAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(400, "File is empty");
    }

    if (resolvedSizeBytes > DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeTaskAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(
        400,
        `File exceeds ${DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`
      );
    }

    if (!isAllowedAttachmentMimeType(resolvedMimeType)) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeTaskAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(
        400,
        "Unsupported file type. Use PDF, image, text, CSV, or JSON."
      );
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: input.taskId,
        kind: ATTACHMENT_KIND_FILE,
        name: normalizedUpload.data.name,
        storageKey: normalizedStorageKey,
        mimeType: resolvedMimeType,
        sizeBytes: resolvedSizeBytes,
      },
      select: {
        id: true,
        kind: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    return {
      ok: true,
      data: withTaskDownloadUrl(input.projectId, input.taskId, attachment),
    };
  } catch (error) {
    await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
      logServerError("finalizeTaskAttachmentDirectUpload.cleanup", cleanupError);
    });
    logServerError("finalizeTaskAttachmentDirectUpload", error);
    return createError(500, "Failed to upload attachment");
  }
}

export async function createContextAttachmentUploadTarget(input: {
  projectId: string;
  cardId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ServiceResult<{ upload: AttachmentDirectUploadTargetPayload }>> {
  const card = await prisma.resource.findUnique({
    where: { id: input.cardId },
    select: { id: true, projectId: true, type: true },
  });

  if (
    !card ||
    card.projectId !== input.projectId ||
    card.type !== RESOURCE_TYPE_CONTEXT_CARD
  ) {
    return createError(404, "Context card not found");
  }

  const normalizedUpload = normalizeDirectUploadInput({
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!normalizedUpload.ok) {
    return normalizedUpload;
  }

  try {
    const signedUpload = await createAttachmentSignedUploadUrl({
      scope: "context-card",
      ownerId: input.cardId,
      originalName: normalizedUpload.data.name,
      mimeType: normalizedUpload.data.mimeType,
      sizeBytes: normalizedUpload.data.sizeBytes,
    });

    if (!signedUpload) {
      return createError(
        400,
        "Direct upload is not available for the current storage provider."
      );
    }

    return {
      ok: true,
      data: {
        upload: {
          ...signedUpload,
          maxFileSizeBytes: DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES,
          maxFileSizeLabel: DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL,
        },
      },
    };
  } catch (error) {
    logServerError("createContextAttachmentUploadTarget", error);
    return createError(500, getAttachmentUploadErrorMessage(error));
  }
}

export async function finalizeContextAttachmentDirectUpload(input: {
  projectId: string;
  cardId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ServiceResult<AttachmentResponsePayload>> {
  const card = await prisma.resource.findUnique({
    where: { id: input.cardId },
    select: { id: true, projectId: true, type: true },
  });

  if (
    !card ||
    card.projectId !== input.projectId ||
    card.type !== RESOURCE_TYPE_CONTEXT_CARD
  ) {
    return createError(404, "Context card not found");
  }

  const normalizedStorageKey = input.storageKey.trim();
  if (!hasExpectedStoragePrefix(normalizedStorageKey, "context-card", input.cardId)) {
    return createError(400, "Invalid storage key");
  }

  const normalizedUpload = normalizeDirectUploadInput({
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!normalizedUpload.ok) {
    return normalizedUpload;
  }

  try {
    const metadata = await readAttachmentStoredFileMetadata(normalizedStorageKey);
    if (!metadata) {
      return createError(404, "Uploaded file not found");
    }

    const resolvedSizeBytes = metadata.sizeBytes ?? normalizedUpload.data.sizeBytes;
    const resolvedMimeType = metadata.mimeType ?? normalizedUpload.data.mimeType;

    if (resolvedSizeBytes <= 0) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeContextAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(400, "File is empty");
    }

    if (resolvedSizeBytes > DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_BYTES) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeContextAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(
        400,
        `File exceeds ${DIRECT_UPLOAD_MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`
      );
    }

    if (!isAllowedAttachmentMimeType(resolvedMimeType)) {
      await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
        logServerError("finalizeContextAttachmentDirectUpload.cleanup", cleanupError);
      });
      return createError(
        400,
        "Unsupported file type. Use PDF, image, text, CSV, or JSON."
      );
    }

    const attachment = await prisma.resourceAttachment.create({
      data: {
        resourceId: input.cardId,
        kind: ATTACHMENT_KIND_FILE,
        name: normalizedUpload.data.name,
        storageKey: normalizedStorageKey,
        mimeType: resolvedMimeType,
        sizeBytes: resolvedSizeBytes,
      },
      select: {
        id: true,
        kind: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    return {
      ok: true,
      data: withContextDownloadUrl(input.projectId, input.cardId, attachment),
    };
  } catch (error) {
    await deleteAttachmentFile(normalizedStorageKey).catch((cleanupError) => {
      logServerError("finalizeContextAttachmentDirectUpload.cleanup", cleanupError);
    });
    logServerError("finalizeContextAttachmentDirectUpload", error);
    return createError(500, "Failed to upload attachment");
  }
}

export async function deleteTaskAttachmentForProject(input: {
  projectId: string;
  taskId: string;
  attachmentId: string;
}): Promise<ServiceResult<{ ok: true }>> {
  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: input.attachmentId },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        task: {
          select: {
            id: true,
            projectId: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.task.id !== input.taskId ||
      attachment.task.projectId !== input.projectId
    ) {
      return createError(404, "Attachment not found");
    }

    await prisma.taskAttachment.delete({
      where: { id: attachment.id },
    });

    if (attachment.kind === ATTACHMENT_KIND_FILE && attachment.storageKey) {
      await deleteAttachmentFile(attachment.storageKey).catch((error) => {
        logServerError("deleteTaskAttachmentForProject.cleanup", error);
      });
    }

    return {
      ok: true,
      data: { ok: true },
    };
  } catch (error) {
    logServerError("deleteTaskAttachmentForProject", error);
    return createError(500, "Failed to delete attachment");
  }
}

export async function deleteContextAttachmentForProject(input: {
  projectId: string;
  cardId: string;
  attachmentId: string;
}): Promise<ServiceResult<{ ok: true }>> {
  try {
    const attachment = await prisma.resourceAttachment.findUnique({
      where: { id: input.attachmentId },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        resource: {
          select: {
            id: true,
            projectId: true,
            type: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.resource.id !== input.cardId ||
      attachment.resource.projectId !== input.projectId ||
      attachment.resource.type !== RESOURCE_TYPE_CONTEXT_CARD
    ) {
      return createError(404, "Attachment not found");
    }

    await prisma.resourceAttachment.delete({
      where: { id: attachment.id },
    });

    if (attachment.kind === ATTACHMENT_KIND_FILE && attachment.storageKey) {
      await deleteAttachmentFile(attachment.storageKey).catch((error) => {
        logServerError("deleteContextAttachmentForProject.cleanup", error);
      });
    }

    return {
      ok: true,
      data: { ok: true },
    };
  } catch (error) {
    logServerError("deleteContextAttachmentForProject", error);
    return createError(500, "Failed to delete attachment");
  }
}

export async function getTaskAttachmentDownload(input: {
  projectId: string;
  taskId: string;
  attachmentId: string;
  disposition: "inline" | "attachment";
}): Promise<ServiceResult<AttachmentDownloadPayload>> {
  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: input.attachmentId },
      select: {
        kind: true,
        name: true,
        mimeType: true,
        storageKey: true,
        task: {
          select: {
            id: true,
            projectId: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.task.id !== input.taskId ||
      attachment.task.projectId !== input.projectId ||
      attachment.kind !== ATTACHMENT_KIND_FILE ||
      !attachment.storageKey
    ) {
      return createError(404, "File attachment not found");
    }

    const contentType = attachment.mimeType || "application/octet-stream";
    const filename = encodeURIComponent(attachment.name || "attachment");
    const contentDisposition = `${input.disposition}; filename*=UTF-8''${filename}`;
    const signedUrl = await getAttachmentDownloadUrl({
      storageKey: attachment.storageKey,
      contentType,
      contentDisposition,
    });

    if (signedUrl) {
      return {
        ok: true,
        data: {
          mode: "redirect",
          redirectUrl: signedUrl,
        },
      };
    }

    const buffer = await readAttachmentFile(attachment.storageKey);

    return {
      ok: true,
      data: {
        mode: "proxy",
        content: new Uint8Array(buffer),
        contentType,
        contentDisposition,
      },
    };
  } catch (error) {
    logServerError("getTaskAttachmentDownload", error);
    return createError(500, "Failed to read attachment");
  }
}

export async function getContextAttachmentDownload(input: {
  projectId: string;
  cardId: string;
  attachmentId: string;
  disposition: "inline" | "attachment";
}): Promise<ServiceResult<AttachmentDownloadPayload>> {
  try {
    const attachment = await prisma.resourceAttachment.findUnique({
      where: { id: input.attachmentId },
      select: {
        kind: true,
        name: true,
        mimeType: true,
        storageKey: true,
        resource: {
          select: {
            id: true,
            projectId: true,
            type: true,
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.resource.id !== input.cardId ||
      attachment.resource.projectId !== input.projectId ||
      attachment.resource.type !== RESOURCE_TYPE_CONTEXT_CARD ||
      attachment.kind !== ATTACHMENT_KIND_FILE ||
      !attachment.storageKey
    ) {
      return createError(404, "File attachment not found");
    }

    const contentType = attachment.mimeType || "application/octet-stream";
    const filename = encodeURIComponent(attachment.name || "attachment");
    const contentDisposition = `${input.disposition}; filename*=UTF-8''${filename}`;
    const signedUrl = await getAttachmentDownloadUrl({
      storageKey: attachment.storageKey,
      contentType,
      contentDisposition,
    });

    if (signedUrl) {
      return {
        ok: true,
        data: {
          mode: "redirect",
          redirectUrl: signedUrl,
        },
      };
    }

    const buffer = await readAttachmentFile(attachment.storageKey);

    return {
      ok: true,
      data: {
        mode: "proxy",
        content: new Uint8Array(buffer),
        contentType,
        contentDisposition,
      },
    };
  } catch (error) {
    logServerError("getContextAttachmentDownload", error);
    return createError(500, "Failed to read attachment");
  }
}
