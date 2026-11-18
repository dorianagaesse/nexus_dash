import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  db: {
    $queryRaw: vi.fn(),
    meetingNoteScreenshot: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: mocks.access,
}));
vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: (_actor: string, operation: (db: unknown) => unknown) =>
    operation(mocks.db),
}));
vi.mock("@/lib/attachment-storage", () => ({
  saveAttachmentFile: mocks.save,
  readAttachmentFile: mocks.read,
  deleteAttachmentFile: mocks.remove,
}));
vi.mock("@/lib/observability/logger", () => ({ logServerError: vi.fn() }));
import {
  bindMeetingScreenshots,
  deleteMeetingScreenshotDraft,
  getMeetingScreenshotDownload,
  uploadMeetingScreenshot,
  validateMeetingScreenshots,
} from "@/lib/services/meeting-note-screenshot-service";
import {
  parseCreateMeetingNoteInput,
  parseUpdateMeetingNoteInput,
} from "@/lib/meeting-note-contracts";
const input = { actorUserId: "author", projectId: "project" };
const row = {
  id: "image",
  projectId: "project",
  section: "input",
  name: "shot.png",
  mimeType: "image/png",
  sizeBytes: 10,
  storageKey: "key",
  noteId: null,
  uploadedByUserId: "author",
  note: null,
};
const db = mocks.db as unknown as Parameters<
  typeof bindMeetingScreenshots
>[0]["db"];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ ok: true });
  mocks.save.mockResolvedValue({
    originalName: "shot.png",
    mimeType: "image/png",
    sizeBytes: 10,
    storageKey: "key",
  });
  mocks.db.meetingNoteScreenshot.create.mockResolvedValue(row);
  mocks.db.meetingNoteScreenshot.findFirst.mockResolvedValue(row);
  mocks.db.meetingNoteScreenshot.findMany.mockResolvedValue([]);
  mocks.read.mockResolvedValue(Buffer.from("image bytes"));
});
describe("meeting note screenshots", () => {
  test("uploads images as uploader-private drafts after project authorization", async () => {
    const result = await uploadMeetingScreenshot({
      ...input,
      section: "input",
      file: new File(["image"], "shot.png", { type: "image/png" }),
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        attachment: {
          id: "image",
          section: "input",
          isDraft: true,
          downloadUrl:
            "/api/projects/project/meeting-notes/attachments/image/download",
        },
      },
    });
    expect(mocks.db.meetingNoteScreenshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadedByUserId: "author",
          projectId: "project",
          section: "input",
        }),
      })
    );
    mocks.access.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(
      await uploadMeetingScreenshot({
        ...input,
        section: "input",
        file: new File(["x"], "shot.png", { type: "image/png" }),
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  test.each([
    ["other", new File(["x"], "shot.png", { type: "image/png" })],
    ["input", new File(["text"], "notes.txt", { type: "text/plain" })],
    ["input", new File(["<svg/>"], "shot.svg", { type: "image/svg+xml" })],
    ["input", new File([], "shot.png", { type: "image/png" })],
    [
      "input",
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "shot.png", {
        type: "image/png",
      }),
    ],
  ])("rejects invalid upload %s before storage", async (section, file) => {
    expect(
      await uploadMeetingScreenshot({ ...input, section, file })
    ).toMatchObject({ ok: false, status: 400 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  test("cleans storage when draft persistence fails", async () => {
    mocks.db.meetingNoteScreenshot.create.mockRejectedValue(
      new Error("database")
    );
    expect(
      await uploadMeetingScreenshot({
        ...input,
        section: "input",
        file: new File(["x"], "shot.png", { type: "image/png" }),
      })
    ).toMatchObject({ ok: false, status: 500 });
    expect(mocks.remove).toHaveBeenCalledWith("key");
  });
  test("validates section, project, uploader, and current note before binding", async () => {
    mocks.db.meetingNoteScreenshot.findMany.mockResolvedValue([
      { id: "image" },
    ]);
    expect(
      await validateMeetingScreenshots({
        ...input,
        db,
        noteId: "note",
        inputAttachmentIds: ["image"],
      })
    ).toBeNull();
    expect(mocks.db.meetingNoteScreenshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["image"] },
          projectId: "project",
          section: "input",
          OR: [
            { noteId: null, uploadedByUserId: "author" },
            { noteId: "note" },
          ],
        },
      })
    );
    mocks.db.meetingNoteScreenshot.findMany.mockResolvedValue([]);
    expect(
      await validateMeetingScreenshots({
        ...input,
        db,
        inputAttachmentIds: ["foreign"],
      })
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await validateMeetingScreenshots({
        ...input,
        db,
        inputAttachmentIds: ["image", "image"],
      })
    ).toMatchObject({ ok: false, status: 400 });
  });
  test("replaces only the requested section and leaves omitted sections intact", async () => {
    mocks.db.meetingNoteScreenshot.findMany.mockResolvedValue([
      { storageKey: "old-key" },
    ]);
    expect(
      await bindMeetingScreenshots({
        ...input,
        db,
        noteId: "note",
        outputAttachmentIds: ["new"],
      })
    ).toEqual(["old-key"]);
    expect(mocks.db.meetingNoteScreenshot.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "project",
        noteId: "note",
        section: "output",
        id: { notIn: ["new"] },
      },
    });
    expect(mocks.db.meetingNoteScreenshot.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["new"] },
        projectId: "project",
        section: "output",
        noteId: null,
        uploadedByUserId: "author",
      },
      data: { noteId: "note" },
    });
    expect(mocks.db.meetingNoteScreenshot.deleteMany).toHaveBeenCalledTimes(1);
  });
  test("download checks visibility before reading storage, including drafts", async () => {
    expect(await getMeetingScreenshotDownload(inputWithId())).toMatchObject({
      ok: true,
    });
    for (const hidden of [
      { ...row, uploadedByUserId: "someone" },
      {
        ...row,
        noteId: "note",
        note: { visibility: "private", createdByUserId: "someone" },
      },
      null,
    ]) {
      mocks.read.mockClear();
      mocks.db.meetingNoteScreenshot.findFirst.mockResolvedValue(hidden);
      expect(await getMeetingScreenshotDownload(inputWithId())).toMatchObject({
        ok: false,
        status: 404,
      });
      expect(mocks.read).not.toHaveBeenCalled();
    }
    mocks.db.meetingNoteScreenshot.findFirst.mockResolvedValue({
      ...row,
      noteId: "note",
      note: { visibility: "team", createdByUserId: "someone" },
    });
    expect(await getMeetingScreenshotDownload(inputWithId())).toMatchObject({
      ok: true,
    });
  });
  test("deletes only uploader-owned unbound drafts and cleans their storage", async () => {
    expect(await deleteMeetingScreenshotDraft(inputWithId())).toMatchObject({
      ok: true,
    });
    expect(mocks.db.meetingNoteScreenshot.findFirst).toHaveBeenCalledWith({
      where: {
        id: "image",
        projectId: "project",
        noteId: null,
        uploadedByUserId: "author",
      },
    });
    expect(mocks.remove).toHaveBeenCalledWith("key");
  });
  test("contracts reject malformed attachment ids and preserve omitted versus empty writes", () => {
    for (const value of [null, "image", [1], [""], Array(11).fill("image")]) {
      expect(
        parseCreateMeetingNoteInput({
          title: "Meeting",
          inputAttachmentIds: value,
        }).ok
      ).toBe(false);
      expect(
        parseUpdateMeetingNoteInput({ outputAttachmentIds: value }).ok
      ).toBe(false);
    }
    expect(parseUpdateMeetingNoteInput({ outputAttachmentIds: [] })).toEqual({
      ok: true,
      data: { outputAttachmentIds: [] },
    });
    expect(parseUpdateMeetingNoteInput({ outputNotes: "text" })).toEqual({
      ok: true,
      data: { outputNotes: "text" },
    });
  });
});
function inputWithId() {
  return { ...input, attachmentId: "image" };
}
