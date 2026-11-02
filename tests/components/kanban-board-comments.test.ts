import { describe, expect, test } from "vitest";

import {
  isOptimisticTaskCommentRepresented,
  mergeFetchedTaskComments,
  mergeSubmittedTaskComment,
  restoreCommentDraftAttachments,
} from "@/components/kanban-board-comments";
import type { TaskAttachment, TaskComment } from "@/components/kanban-board-types";

function createAttachment(id: string): TaskAttachment {
  return {
    id,
    kind: "file",
    name: `${id}.png`,
    url: null,
    mimeType: "image/png",
    sizeBytes: 120,
    downloadUrl: `/api/attachments/${id}`,
  };
}

function createComment(
  id: string,
  overrides: Partial<TaskComment> = {}
): TaskComment {
  return {
    id,
    content: `<p>${id}</p>`,
    createdAt: "2026-09-13T08:00:00.000Z",
    author: {
      id: "user-1",
      displayName: "Test User",
      usernameTag: null,
      avatarSeed: "user-1",
    },
    reactions: [],
    ...overrides,
  };
}

const optimisticId = "optimistic-comment-1";

describe("mergeFetchedTaskComments", () => {
  test("drops an optimistic comment when a fetched server comment carries the same attachment", () => {
    const sharedAttachment = createAttachment("att-1");
    const optimistic = createComment(optimisticId, {
      content: "",
      attachments: [sharedAttachment],
    });
    const persisted = createComment("comment-server-1", {
      content: "",
      attachments: [{ ...sharedAttachment, commentId: "comment-server-1" }],
    });

    const next = mergeFetchedTaskComments([persisted], [optimistic]);

    expect(next.map((comment) => comment.id)).toEqual(["comment-server-1"]);
  });

  test("drops an optimistic comment when a fetched server comment matches author and content", () => {
    const optimistic = createComment(optimisticId, {
      content: "<p>Same body</p>",
    });
    const persisted = createComment("comment-server-1", {
      content: "<p>Same body</p>",
    });

    expect(isOptimisticTaskCommentRepresented(optimistic, [persisted])).toBe(
      true
    );
    expect(
      mergeFetchedTaskComments([persisted], [optimistic]).map(
        (comment) => comment.id
      )
    ).toEqual(["comment-server-1"]);
  });

  test("retains an unpersisted optimistic comment when fetched comments predate it", () => {
    const existing = createComment("comment-a", {
      createdAt: "2026-09-13T08:00:00.000Z",
    });
    const optimistic = createComment(optimisticId, {
      content: "<p>Pending comment</p>",
      createdAt: "2026-09-13T08:01:00.000Z",
    });

    const next = mergeFetchedTaskComments([existing], [existing, optimistic]);

    expect(next.map((comment) => comment.id)).toEqual([
      "comment-a",
      optimisticId,
    ]);
  });
});

describe("mergeSubmittedTaskComment", () => {
  test("replaces the optimistic placeholder with the submitted comment", () => {
    const previous = [createComment("comment-a"), createComment(optimisticId)];

    const next = mergeSubmittedTaskComment(
      previous,
      optimisticId,
      createComment("comment-x")
    );

    expect(next.map((comment) => comment.id)).toEqual([
      "comment-a",
      "comment-x",
    ]);
  });

  test("appends the submitted comment when the placeholder is gone", () => {
    const previous = [createComment("comment-a")];

    const next = mergeSubmittedTaskComment(
      previous,
      optimisticId,
      createComment("comment-x")
    );

    expect(next.map((comment) => comment.id)).toEqual([
      "comment-a",
      "comment-x",
    ]);
  });

  test("does not duplicate the comment when a load already inserted it", () => {
    const previous = [
      createComment("comment-a"),
      createComment(optimisticId),
      createComment("comment-x"),
    ];

    const next = mergeSubmittedTaskComment(
      previous,
      optimisticId,
      createComment("comment-x")
    );

    expect(next.map((comment) => comment.id)).toEqual([
      "comment-a",
      "comment-x",
    ]);
  });

  test("keeps a single copy when the submit response replays", () => {
    const previous = [createComment("comment-a"), createComment("comment-x")];

    const next = mergeSubmittedTaskComment(
      previous,
      optimisticId,
      createComment("comment-x")
    );

    expect(next.map((comment) => comment.id)).toEqual([
      "comment-a",
      "comment-x",
    ]);
  });

  test("returns only the submitted comment for an empty list", () => {
    const next = mergeSubmittedTaskComment(
      [],
      optimisticId,
      createComment("comment-x")
    );

    expect(next.map((comment) => comment.id)).toEqual(["comment-x"]);
  });
});


test("recovers unpublished comment files without shared task metadata or stored URLs", () => {
  const attachment = { ...createAttachment("draft"), downloadUrl: "javascript:bad", url: "https://other.example", sizeBytes: -1 };
  expect(restoreCommentDraftAttachments({ attachmentIds: ["draft"], snapshots: [attachment, attachment, { ...attachment, id: "unselected" }, null], taskAttachments: [], projectId: "project", taskId: "task" })).toEqual([{ ...attachment, commentId: null, url: null, sizeBytes: null, downloadUrl: "/api/projects/project/tasks/task/attachments/draft/download" }]);
});

test("legacy comment drafts recover from the task list without a new base fingerprint", () => {
  expect(restoreCommentDraftAttachments({ attachmentIds: ["legacy"], taskAttachments: [createAttachment("legacy")], projectId: "project", taskId: "task" })).toMatchObject([{ id: "legacy", kind: "file" }]);
});
