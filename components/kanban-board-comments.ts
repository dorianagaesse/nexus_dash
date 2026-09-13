import type { TaskComment } from "@/components/kanban-board-types";

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
