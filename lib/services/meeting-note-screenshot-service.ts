import { Prisma } from "@prisma/client";
import {
  deleteAttachmentFile,
  readAttachmentFile,
  saveAttachmentFile,
} from "@/lib/attachment-storage";
import { logServerError } from "@/lib/observability/logger";
import {
  MAX_MEETING_SCREENSHOTS,
  type MeetingNoteScreenshot,
  type MeetingScreenshotSection,
} from "@/lib/meeting-note-screenshot";
import {
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_LABEL,
  resolveAttachmentMimeType,
} from "@/lib/task-attachment";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";

type ScreenshotRecord = {
  id: string;
  projectId: string;
  section: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};
export const meetingScreenshotSelect = {
  id: true,
  projectId: true,
  section: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
} as const;

export function mapMeetingScreenshot(
  row: ScreenshotRecord
): MeetingNoteScreenshot {
  return {
    id: row.id,
    section: row.section as MeetingScreenshotSection,
    kind: "file",
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: null,
    downloadUrl: `/api/projects/${row.projectId}/meeting-notes/attachments/${row.id}/download`,
  };
}

const failure = (status: number, error: string) => ({
  ok: false as const,
  status,
  error,
});

export async function cleanupMeetingScreenshotFiles(keys: string[]) {
  await Promise.all(
    keys.map(async (storageKey) => {
      try {
        await deleteAttachmentFile(storageKey);
      } catch (error) {
        logServerError("meeting-screenshot.cleanup", error);
      }
    })
  );
}

export async function uploadMeetingScreenshot(input: {
  actorUserId: string;
  projectId: string;
  section: string;
  file: File;
}) {
  if (input.section !== "input" && input.section !== "output")
    return failure(400, "Invalid screenshot section");
  const mimeType = resolveAttachmentMimeType(input.file.type, input.file.name);
  if (!mimeType?.startsWith("image/"))
    return failure(400, "Choose an image file for the screenshot.");
  if (input.file.size <= 0) return failure(400, "File is empty");
  if (input.file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES)
    return failure(400, `File exceeds ${MAX_ATTACHMENT_FILE_SIZE_LABEL} limit`);
  let storageKey: string | undefined;
  try {
    return await withActorRlsContext(
      input.actorUserId,
      async (db) => {
        const access = await requireProjectRole({
          ...input,
          minimumRole: "editor",
          capability: "meeting:write",
          db,
        });
        if (!access.ok) return access;
        const stored = await saveAttachmentFile({
          scope: "meeting-note",
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          ownerId: "draft",
          file: input.file,
        });
        storageKey = stored.storageKey;
        const row = await db.meetingNoteScreenshot.create({
          data: {
            projectId: input.projectId,
            section: input.section,
            uploadedByUserId: input.actorUserId,
            name: stored.originalName,
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
          },
          select: meetingScreenshotSelect,
        });
        return {
          ok: true as const,
          data: { attachment: { ...mapMeetingScreenshot(row), isDraft: true } },
        };
      },
      { forceTransaction: true }
    );
  } catch (error) {
    if (storageKey) await cleanupMeetingScreenshotFiles([storageKey]);
    logServerError("meeting-screenshot.upload", error);
    return failure(500, "Could not upload screenshot. Please retry.");
  }
}

// Validate before any note mutations; binding is performed in that same transaction.
export async function validateMeetingScreenshots(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  noteId?: string;
  inputAttachmentIds?: string[];
  outputAttachmentIds?: string[];
}) {
  for (const [section, ids] of [
    ["input", input.inputAttachmentIds],
    ["output", input.outputAttachmentIds],
  ] as const) {
    if (ids === undefined) continue;
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_MEETING_SCREENSHOTS ||
      ids.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(ids).size !== ids.length
    ) {
      return failure(400, "meeting-note-screenshots-invalid");
    }
    if (ids.length === 0) continue;
    await input.db.$queryRaw(
      Prisma.sql`SELECT id FROM "MeetingNoteScreenshot" WHERE id IN (${Prisma.join(ids)}) AND "projectId" = ${input.projectId} ORDER BY id FOR UPDATE`
    );
    const rows = await input.db.meetingNoteScreenshot.findMany({
      where: {
        id: { in: ids },
        projectId: input.projectId,
        section,
        OR: [
          { noteId: null, uploadedByUserId: input.actorUserId },
          ...(input.noteId ? [{ noteId: input.noteId }] : []),
        ],
      },
      select: { id: true },
    });
    if (rows.length !== ids.length)
      return failure(400, "meeting-note-screenshots-invalid");
  }
  return null;
}

export async function bindMeetingScreenshots(input: {
  db: DbClient;
  actorUserId: string;
  projectId: string;
  noteId: string;
  inputAttachmentIds?: string[];
  outputAttachmentIds?: string[];
}): Promise<string[]> {
  const removedKeys: string[] = [];
  for (const [section, ids] of [
    ["input", input.inputAttachmentIds],
    ["output", input.outputAttachmentIds],
  ] as const) {
    if (ids === undefined) continue;
    const removedWhere = {
      projectId: input.projectId,
      noteId: input.noteId,
      section,
      id: { notIn: ids },
    };
    const removed = await input.db.meetingNoteScreenshot.findMany({
      where: removedWhere,
      select: { storageKey: true },
    });
    if (removed.length) {
      await input.db.meetingNoteScreenshot.deleteMany({ where: removedWhere });
      removedKeys.push(...removed.map((row) => row.storageKey));
    }
    if (ids.length)
      await input.db.meetingNoteScreenshot.updateMany({
        where: {
          id: { in: ids },
          projectId: input.projectId,
          section,
          noteId: null,
          uploadedByUserId: input.actorUserId,
        },
        data: { noteId: input.noteId },
      });
  }
  return removedKeys;
}

export async function getMeetingScreenshotDownload(input: {
  actorUserId: string;
  projectId: string;
  attachmentId: string;
}) {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const access = await requireProjectRole({
      ...input,
      minimumRole: "viewer",
      capability: "meeting:read",
      db,
    });
    if (!access.ok) return access;
    const row = await db.meetingNoteScreenshot.findFirst({
      where: { id: input.attachmentId, projectId: input.projectId },
      include: {
        note: { select: { visibility: true, createdByUserId: true } },
      },
    });
    if (
      !row ||
      (row.note
        ? !(
            row.note.visibility === "team" ||
            row.note.createdByUserId === input.actorUserId
          )
        : row.uploadedByUserId !== input.actorUserId)
    )
      return failure(404, "Screenshot not found");
    try {
      // Proxy reads so every request rechecks note visibility; never persist a public image URL.
      const content = await readAttachmentFile(row.storageKey);
      return {
        ok: true as const,
        data: { content, mimeType: row.mimeType, name: row.name },
      };
    } catch (error) {
      logServerError("meeting-screenshot.download", error);
      return failure(404, "Screenshot not found");
    }
  });
}

export async function deleteMeetingScreenshotDraft(input: {
  actorUserId: string;
  projectId: string;
  attachmentId: string;
}) {
  let storageKey: string | undefined;
  const result = await withActorRlsContext(
    input.actorUserId,
    async (db) => {
      const access = await requireProjectRole({
        ...input,
        minimumRole: "editor",
        capability: "meeting:write",
        db,
      });
      if (!access.ok) return access;
      const row = await db.meetingNoteScreenshot.findFirst({
        where: {
          id: input.attachmentId,
          projectId: input.projectId,
          noteId: null,
          uploadedByUserId: input.actorUserId,
        },
      });
      if (!row) return failure(404, "Screenshot draft not found");
      await db.meetingNoteScreenshot.delete({ where: { id: row.id } });
      storageKey = row.storageKey;
      return { ok: true as const, data: { ok: true } };
    },
    { forceTransaction: true }
  );
  if (result.ok && storageKey)
    await cleanupMeetingScreenshotFiles([storageKey]);
  return result;
}
