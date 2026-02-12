import { NextRequest, NextResponse } from "next/server";

import { deleteAttachmentFile, saveAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  ATTACHMENT_KIND_FILE,
  ATTACHMENT_KIND_LINK,
  isAllowedAttachmentMimeType,
  isAttachmentKind,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
} from "@/lib/task-attachment";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeLinkUrl(value: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; cardId: string } }
) {
  const { projectId, cardId } = params;

  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  const card = await prisma.resource.findUnique({
    where: { id: cardId },
    select: { id: true, projectId: true, type: true },
  });

  if (
    !card ||
    card.projectId !== projectId ||
    card.type !== RESOURCE_TYPE_CONTEXT_CARD
  ) {
    return NextResponse.json({ error: "Context card not found" }, { status: 404 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    console.error(
      "[POST /api/projects/:projectId/context-cards/:cardId/attachments] invalid form",
      error
    );
    return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
  }

  const kind = readText(formData, "kind");

  if (!isAttachmentKind(kind)) {
    return NextResponse.json({ error: "Invalid attachment kind" }, { status: 400 });
  }

  if (kind === ATTACHMENT_KIND_LINK) {
    const rawUrl = readText(formData, "url");
    const normalizedUrl = normalizeLinkUrl(rawUrl);
    const providedName = readText(formData, "name");

    if (!normalizedUrl) {
      return NextResponse.json({ error: "Invalid link URL" }, { status: 400 });
    }

    const fallbackName = new URL(normalizedUrl).hostname;
    const name = providedName || fallbackName;

    try {
      const attachment = await prisma.resourceAttachment.create({
        data: {
          resourceId: cardId,
          kind: ATTACHMENT_KIND_LINK,
          name,
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

      return NextResponse.json({
        attachment: {
          ...attachment,
          downloadUrl: null,
        },
      });
    } catch (error) {
      console.error(
        "[POST /api/projects/:projectId/context-cards/:cardId/attachments] link create",
        error
      );
      return NextResponse.json({ error: "Failed to create attachment" }, { status: 500 });
    }
  }

  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (fileEntry.size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (fileEntry.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  if (!isAllowedAttachmentMimeType(fileEntry.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, image, text, CSV, or JSON." },
      { status: 400 }
    );
  }

  const providedName = readText(formData, "name");
  let storageKey: string | null = null;

  try {
    const storedFile = await saveAttachmentFile({
      scope: "context-card",
      ownerId: cardId,
      file: fileEntry,
    });
    storageKey = storedFile.storageKey;

    const attachment = await prisma.resourceAttachment.create({
      data: {
        resourceId: cardId,
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

    return NextResponse.json({
      attachment: {
        ...attachment,
        downloadUrl: `/api/projects/${projectId}/context-cards/${cardId}/attachments/${attachment.id}/download`,
      },
    });
  } catch (error) {
    if (storageKey) {
      await deleteAttachmentFile(storageKey).catch((storageError) => {
        console.error(
          "[POST /api/projects/:projectId/context-cards/:cardId/attachments] cleanup failed",
          storageError
        );
      });
    }

    console.error(
      "[POST /api/projects/:projectId/context-cards/:cardId/attachments] file create",
      error
    );
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 });
  }
}
