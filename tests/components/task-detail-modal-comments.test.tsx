// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/image", async () => {
  const ReactModule = await import("react");

  return {
    default: (props: Record<string, unknown>) => {
      const { unoptimized, ...imageProps } = props;
      void unoptimized;

      return ReactModule.createElement("img", imageProps);
    },
  };
});

import { TaskDetailModal } from "@/components/kanban/task-detail-modal";
import type {
  KanbanTask,
  TaskComment,
} from "@/components/kanban-board-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ownerSummary = {
  id: "owner-1",
  displayName: "owner",
  usernameTag: "owner#0001",
  avatarSeed: "owner-1",
};

const baseTask: KanbanTask = {
  id: "task-1",
  title: "Comment identity",
  description: null,
  deadlineDate: null,
  commentCount: 1,
  labels: [],
  blockedFollowUps: [],
  status: "Backlog",
  archivedAt: null,
  attachments: [],
  relatedTasks: [],
  epic: null,
  assignee: null,
  createdBy: ownerSummary,
  updatedBy: ownerSummary,
  createdAt: "2026-05-31T09:00:00.000Z",
  updatedAt: "2026-05-31T09:00:00.000Z",
};

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

async function renderWithRoot(root: Root, comments: TaskComment[]) {
  await act(async () => {
    root.render(
      <TaskDetailModal
        projectId="project-1"
        canEdit={false}
        isOpen
        selectedTask={{ ...baseTask, commentCount: comments.length }}
        isEditMode={false}
        editTitle=""
        editLabels={[]}
        editLabelInput=""
        editLabelSuggestions={[]}
        editDescription=""
        editDeadlineDate=""
        editEpicId=""
        editAssigneeUserId=""
        editRelatedTasks={[]}
        relatedTaskSearch=""
        newBlockedFollowUpEntry=""
        isUpdatingTask={false}
        taskModalError={null}
        attachmentError={null}
        isSubmittingAttachment={false}
        isArchivingTask={false}
        isArchivedTask={false}
        hasPendingAttachmentUploads={false}
        pendingAttachmentUploads={[]}
        isLinkComposerOpen={false}
        linkUrl=""
        fileInputKey={0}
        previewAttachment={null}
        taskComments={comments}
        taskCommentsError={null}
        isLoadingTaskComments={false}
        newTaskComment=""
        isSubmittingTaskComment={false}
        onClose={vi.fn()}
        onActivateEditMode={vi.fn()}
        onToggleEditMode={vi.fn()}
        onEditTitleChange={vi.fn()}
        onEditLabelInputChange={vi.fn()}
        onAddEditLabel={vi.fn()}
        onRemoveEditLabel={vi.fn()}
        onEditDescriptionChange={vi.fn()}
        onEditDeadlineDateChange={vi.fn()}
        onEditEpicIdChange={vi.fn()}
        onEditAssigneeUserIdChange={vi.fn()}
        onRelatedTaskSearchChange={vi.fn()}
        onAddRelatedTask={vi.fn()}
        onRemoveRelatedTask={vi.fn()}
        availableEpicOptions={[]}
        availableAssignees={[]}
        mentionUsers={[]}
        availableRelatedTaskOptions={[]}
        onOpenRelatedTask={vi.fn()}
        onNewBlockedFollowUpEntryChange={vi.fn()}
        onAddBlockedFollowUpEntry={vi.fn()}
        onSaveTask={vi.fn()}
        onQuickEpicChange={vi.fn()}
        onQuickAssigneeChange={vi.fn()}
        onToggleLinkComposer={vi.fn()}
        onLinkUrlChange={vi.fn()}
        onAddLinkAttachment={vi.fn()}
        onAddFileAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onPreviewAttachmentChange={vi.fn()}
        onNewTaskCommentChange={vi.fn()}
        onSubmitTaskComment={vi.fn()}
        onMoveTask={vi.fn()}
        onArchiveTask={vi.fn()}
        onUnarchiveTask={vi.fn()}
        onRequestDeleteTask={vi.fn()}
      />
    );
  });
}

describe("TaskDetailModal comments", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ reactions: [] }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("renders agent-authored comments with credential identity and shared avatar", async () => {
    const { root } = createTestRenderer();

    await renderWithRoot(root, [
      {
        id: "comment-agent",
        content: "Agent status update",
        createdAt: "2026-05-31T09:30:00.000Z",
        reactions: [],
        author: {
          id: "credential-1",
          kind: "agent",
          displayName: "Build bot (agent)",
          usernameTag: null,
          avatarSeed: "nexusdash-agent-comment-avatar",
          agentCredentialId: "credential-1",
          agentCredentialLabel: "Build bot",
          owner: ownerSummary,
        },
      },
    ]);

    expect(document.body.textContent).toContain("Build bot (agent)");
    expect(document.body.textContent).toContain("via owner#0001");
    expect(document.body.querySelectorAll("[data-agent-avatar='true']")).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps human-authored comments on the generated user avatar path", async () => {
    const { root } = createTestRenderer();

    await renderWithRoot(root, [
      {
        id: "comment-human",
        content: "Human status update",
        createdAt: "2026-05-31T09:30:00.000Z",
        reactions: [],
        author: {
          ...ownerSummary,
          kind: "user",
          agentCredentialId: null,
          agentCredentialLabel: null,
          owner: null,
        },
      },
    ]);

    expect(document.body.textContent).toContain("owner");
    expect(document.body.querySelectorAll("[data-agent-avatar='true']")).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });
});
