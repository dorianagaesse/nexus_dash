// @vitest-environment jsdom

import React, { useState } from "react";
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
  reference: "ND-42",
  title: "Comment identity",
  description: null,
  deadlineDate: null,
  commentCount: 1,
  labels: [],
  blockedFollowUps: [],
  status: "Backlog",
  position: 0,
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

let taskForRender = baseTask;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

function buildModalProps(comments: TaskComment[]) {
  return {
    projectId: "project-1",
    canEdit: false,
    isOpen: true,
    selectedTask: { ...taskForRender, commentCount: comments.length },
    isEditMode: false,
    editTitle: "",
    editLabels: [],
    editLabelInput: "",
    editLabelSuggestions: [],
    editDescription: "",
    editDeadlineDate: "",
    editEpicId: "",
    editAssigneeUserId: "",
    editRelatedTasks: [],
    relatedTaskSearch: "",
    newBlockedFollowUpEntry: "",
    isUpdatingTask: false,
    taskModalError: null,
    attachmentError: null,
    isSubmittingAttachment: false,
    isArchivingTask: false,
    isArchivedTask: false,
    hasPendingAttachmentUploads: false,
    pendingAttachmentUploads: [],
    isLinkComposerOpen: false,
    linkUrl: "",
    fileInputKey: 0,
    previewAttachment: null,
    taskComments: comments,
    taskCommentsError: null,
    isLoadingTaskComments: false,
    newTaskComment: "",
    isSubmittingTaskComment: false,
    onClose: vi.fn(),
    onActivateEditMode: vi.fn(),
    onToggleEditMode: vi.fn(),
    onEditTitleChange: vi.fn(),
    onEditLabelInputChange: vi.fn(),
    onAddEditLabel: vi.fn(),
    onRemoveEditLabel: vi.fn(),
    onEditDescriptionChange: vi.fn(),
    onEditDeadlineDateChange: vi.fn(),
    onEditEpicIdChange: vi.fn(),
    onEditAssigneeUserIdChange: vi.fn(),
    onRelatedTaskSearchChange: vi.fn(),
    onAddRelatedTask: vi.fn(),
    onRemoveRelatedTask: vi.fn(),
    availableEpicOptions: [],
    availableAssignees: [],
    mentionUsers: [],
    availableRelatedTaskOptions: [],
    onOpenRelatedTask: vi.fn(),
    onNewBlockedFollowUpEntryChange: vi.fn(),
    onAddBlockedFollowUpEntry: vi.fn(),
    onSaveTask: vi.fn(),
    onQuickEpicChange: vi.fn(),
    onQuickAssigneeChange: vi.fn(),
    onToggleLinkComposer: vi.fn(),
    onLinkUrlChange: vi.fn(),
    onAddLinkAttachment: vi.fn(),
    onAddFileAttachment: vi.fn(),
    onDeleteAttachment: vi.fn(),
    onPreviewAttachmentChange: vi.fn(),
    onNewTaskCommentChange: vi.fn(),
    onSubmitTaskComment: vi.fn(),
    onMoveTask: vi.fn(),
    onArchiveTask: vi.fn(),
    onUnarchiveTask: vi.fn(),
    onRequestDeleteTask: vi.fn(),
  };
}

type ModalProps = ReturnType<typeof buildModalProps>;

async function renderWithRoot(
  root: Root,
  comments: TaskComment[],
  overrides?: Partial<ModalProps>
) {
  await act(async () => {
    root.render(<TaskDetailModal {...buildModalProps(comments)} {...overrides} />);
  });
}

function CommentComposerHarness({
  onSubmitTaskComment,
}: {
  onSubmitTaskComment: ModalProps["onSubmitTaskComment"];
}) {
  const [comment, setComment] = useState("");

  return (
    <TaskDetailModal
      {...buildModalProps([])}
      canEdit
      newTaskComment={comment}
      onNewTaskCommentChange={setComment}
      onSubmitTaskComment={onSubmitTaskComment}
    />
  );
}

async function renderComposer(
  root: Root,
  onSubmitTaskComment: ModalProps["onSubmitTaskComment"]
) {
  await act(async () => {
    root.render(
      <CommentComposerHarness onSubmitTaskComment={onSubmitTaskComment} />
    );
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(textarea, value);
  textarea.setSelectionRange(value.length, value.length);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function waitForSearchDebounce() {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

describe("TaskDetailModal comments", () => {
  beforeEach(() => {
    taskForRender = baseTask;
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
    expect(
      document.body.querySelector("[aria-label='Task reference ND-42']")
    ).not.toBeNull();
    expect(document.body.querySelectorAll("[data-agent-avatar='true']")).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("renders agent task attribution with the shared agent avatar", async () => {
    const { root } = createTestRenderer();
    const agentAuthor = {
      id: "credential-1",
      kind: "agent" as const,
      displayName: "Build bot (agent)",
      usernameTag: null,
      avatarSeed: "nexusdash-agent-comment-avatar",
      agentCredentialId: "credential-1",
      agentCredentialLabel: "Build bot",
      owner: ownerSummary,
    };
    taskForRender = {
      ...baseTask,
      createdBy: agentAuthor,
      updatedBy: agentAuthor,
    };

    await renderWithRoot(root, []);

    expect(
      document.body.querySelector(
        "[title='Created by: Build bot (agent)'] [data-agent-avatar='true']"
      )
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        "[title='Last updated by: Build bot (agent)'] [data-agent-avatar='true']"
      )
    ).not.toBeNull();
    expect(document.body.querySelectorAll("[data-agent-avatar='true']")).toHaveLength(2);

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

  test("inserts an agent token and submits the tagged-agent selection", async () => {
    const { root } = createTestRenderer();
    const onSubmitTaskComment = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/actors/search")) {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
              actors: [
                {
                  kind: "agent",
                  id: "credential-1",
                  displayName: "Release bot",
                  usernameTag: null,
                  avatarSeed: null,
                  projectRole: null,
                  isOwner: false,
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ reactions: [] }),
        });
      })
    );

    await renderComposer(root, onSubmitTaskComment);

    const textarea = document.getElementById(
      "task-comment-input"
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    act(() => {
      setTextareaValue(textarea, "@rel");
    });
    await act(async () => {
      await waitForSearchDebounce();
    });

    const agentOption = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));
    expect(agentOption).toBeDefined();
    expect(agentOption?.getAttribute("aria-disabled")).toBe("false");

    act(() => {
      agentOption?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(textarea.value).toBe("@{Release bot} ");

    const submitButton = Array.from(
      document.querySelectorAll("button")
    ).find((button) => button.textContent === "Add comment");
    expect(submitButton).toBeDefined();

    act(() => {
      submitButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onSubmitTaskComment).toHaveBeenCalledWith(
      [],
      [{ credentialId: "credential-1" }]
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("drops the agent selection when the token stops matching", async () => {
    const { root } = createTestRenderer();
    const onSubmitTaskComment = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/actors/search")) {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
              actors: [
                {
                  kind: "agent",
                  id: "credential-1",
                  displayName: "Release bot",
                  usernameTag: null,
                  avatarSeed: null,
                  projectRole: null,
                  isOwner: false,
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ reactions: [] }),
        });
      })
    );

    await renderComposer(root, onSubmitTaskComment);

    const textarea = document.getElementById(
      "task-comment-input"
    ) as HTMLTextAreaElement;

    act(() => {
      setTextareaValue(textarea, "@rel");
    });
    await act(async () => {
      await waitForSearchDebounce();
    });

    const agentOption = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));

    act(() => {
      agentOption?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });
    expect(textarea.value).toBe("@{Release bot} ");

    act(() => {
      setTextareaValue(textarea, "@{Release bot without close");
    });

    const submitButton = Array.from(
      document.querySelectorAll("button")
    ).find((button) => button.textContent === "Add comment");

    act(() => {
      submitButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onSubmitTaskComment).toHaveBeenCalledWith([], []);

    await act(async () => {
      root.unmount();
    });
  });
});
