import { describe, expect, test } from "vitest";

import { mergeSubmittedTaskComment } from "@/components/kanban-board-comments";
import type { TaskComment } from "@/components/kanban-board-types";

function createComment(id: string): TaskComment {
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
  };
}

const optimisticId = "optimistic-comment-1";

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
