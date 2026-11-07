import { resolveAttachmentMimeType } from "@/lib/task-attachment";
import { MAX_TASK_COMMENT_ATTACHMENTS } from "@/lib/task-comment";
import type { TaskAttachment, TaskComment } from "@/components/kanban-board-types";

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


// Draft files are intentionally absent from shared task reads. Keep only safe
// display metadata locally; every restored download still uses server auth.
export function restoreCommentDraftAttachments(input: {
  attachmentIds: string[];
  snapshots?: unknown;
  taskAttachments: TaskAttachment[];
  projectId: string;
  taskId: string;
}): TaskAttachment[] {
  const ids = new Set(input.attachmentIds);
  const entries = Array.isArray(input.snapshots) ? input.snapshots : input.taskAttachments;
  const restored: TaskAttachment[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" ||
      !ids.delete(entry.id) || entry.kind !== "file" || typeof entry.name !== "string") continue;
    restored.push({
      id: entry.id, kind: "file", name: entry.name, commentId: null, url: null,
      mimeType: resolveAttachmentMimeType(typeof entry.mimeType === "string" ? entry.mimeType : null, entry.name),
      sizeBytes: typeof entry.sizeBytes === "number" && Number.isFinite(entry.sizeBytes) && entry.sizeBytes > 0 ? entry.sizeBytes : null,
      downloadUrl: `/api/projects/${encodeURIComponent(input.projectId)}/tasks/${encodeURIComponent(input.taskId)}/attachments/${encodeURIComponent(entry.id)}/download`,
    });
    if (restored.length === MAX_TASK_COMMENT_ATTACHMENTS) break;
  }
  return restored;
}
