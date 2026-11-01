import type { TaskComment } from "@/components/kanban-board-types";

export function isOptimisticTaskCommentRepresented(
  optimisticComment: TaskComment,
  persistedComments: TaskComment[]
): boolean {
  if (!optimisticComment.id.startsWith("optimistic-comment-")) {
    return false;
  }

  const optimisticAttachmentIds = (optimisticComment.attachments ?? []).map(
    (attachment) => attachment.id
  );

  return persistedComments.some((persistedComment) => {
    if (persistedComment.id.startsWith("optimistic-comment-")) {
      return false;
    }

    if (optimisticAttachmentIds.length > 0) {
      const persistedAttachmentIds = new Set(
        (persistedComment.attachments ?? []).map((attachment) => attachment.id)
      );
      if (
        optimisticAttachmentIds.some((attachmentId) =>
          persistedAttachmentIds.has(attachmentId)
        )
      ) {
        return true;
      }
    }

    return (
      persistedComment.author.id === optimisticComment.author.id &&
      persistedComment.content === optimisticComment.content
    );
  });
}

export function mergeFetchedTaskComments(
  fetchedComments: TaskComment[],
  currentComments: TaskComment[]
): TaskComment[] {
  const commentsById = new Map<string, TaskComment>();

  fetchedComments.forEach((comment) => {
    commentsById.set(comment.id, comment);
  });

  currentComments.forEach((comment) => {
    if (
      !commentsById.has(comment.id) &&
      !isOptimisticTaskCommentRepresented(comment, fetchedComments)
    ) {
      commentsById.set(comment.id, comment);
    }
  });

  return Array.from(commentsById.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

/**
 * Applies one submitted task comment to the loaded comment list.
 *
 * A comment load can resolve while the submission is still in flight and
 * insert the server-authored comment before the POST response is applied.
 * Removing both the optimistic placeholder and any copy that already arrived
 * makes the merge idempotent, so the response never appends a duplicate.
 */
export function mergeSubmittedTaskComment(
  previousComments: TaskComment[],
  optimisticCommentId: string,
  submittedComment: TaskComment
): TaskComment[] {
  const withoutOptimisticOrSubmitted = previousComments.filter(
    (comment) =>
      comment.id !== optimisticCommentId && comment.id !== submittedComment.id
  );

  return [...withoutOptimisticOrSubmitted, submittedComment];
}
