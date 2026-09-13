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
    editAssignee: null,
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
    onEditAssigneeChange: vi.fn(),
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
    <>
      <TaskDetailModal
        {...buildModalProps([])}
        canEdit
        newTaskComment={comment}
        onNewTaskCommentChange={setComment}
        onSubmitTaskComment={onSubmitTaskComment}
      />
      <output data-testid="comment-value">{comment}</output>
    </>
  );
}

async function renderComposer(
  root: Root,
  onSubmitTaskComment: ModalProps["onSubmitTaskComment"]
) {
  await act(async () => {
    root.render(<CommentComposerHarness onSubmitTaskComment={onSubmitTaskComment} />);
  });
}

// jsdom has no layout engine, so Range#getClientRects does not exist at all.
// The composer's mention picker needs a non-zero caret rect to anchor itself.
const RANGE_VIEWPORT_RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  bottom: 16,
  right: 120,
  width: 120,
  height: 16,
  toJSON: () => ({}),
} as DOMRect;

const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects"
);

function installRangeClientRectsMock() {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: () => [RANGE_VIEWPORT_RECT],
  });
}

function restoreRangeClientRectsMock() {
  if (rangeClientRectsDescriptor) {
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      rangeClientRectsDescriptor
    );
    return;
  }

  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
}

function selectEditorText(textNode: Text, offset: number) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

async function typeIntoCommentEditor(editor: HTMLDivElement, text: string) {
  const textNode = document.createTextNode(text);
  editor.replaceChildren(textNode);
  selectEditorText(textNode, text.length);

  await act(async () => {
    editor.dispatchEvent(
      new Event("beforeinput", { bubbles: true, cancelable: true })
    );
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function findButtonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === text
  );
}

function waitForSearchDebounce() {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

function stubActorSearchFetch() {
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
}

describe("TaskDetailModal comments", () => {
  beforeEach(() => {
    taskForRender = baseTask;
    installRangeClientRectsMock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ reactions: [] }),
      })
    );
  });

  afterEach(() => {
    restoreRangeClientRectsMock();
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

  test("inserts an agent token chip and submits the tagged-agent selection", async () => {
    const { root } = createTestRenderer();
    const onSubmitTaskComment = vi.fn();
    stubActorSearchFetch();

    await renderComposer(root, onSubmitTaskComment);

    const editor = document.getElementById(
      "task-comment-input"
    ) as HTMLDivElement;
    expect(editor).not.toBeNull();

    await typeIntoCommentEditor(editor, "@rel");
    await act(async () => {
      await waitForSearchDebounce();
    });

    const agentOption = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));
    expect(agentOption).toBeDefined();
    expect(agentOption?.getAttribute("aria-disabled")).toBe("false");

    await act(async () => {
      agentOption?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    const chip = editor.querySelector<HTMLElement>(
      "[data-editor-mention='true']"
    );
    expect(chip?.textContent).toBe("@Release bot");
    expect(chip?.dataset.mentionRaw).toBe("@{Release bot}");
    expect(chip?.dataset.agentMentionLabel).toBe("Release bot");
    expect(editor.textContent).not.toContain("{");
    expect(
      document.querySelector("output[data-testid='comment-value']")?.textContent
    ).toBe("@{Release bot} ");
    expect(document.querySelector("[role='option']")).toBeNull();

    const submitButton = findButtonByText("Add comment");
    expect(submitButton).toBeDefined();

    await act(async () => {
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
    stubActorSearchFetch();

    await renderComposer(root, onSubmitTaskComment);

    const editor = document.getElementById(
      "task-comment-input"
    ) as HTMLDivElement;

    await typeIntoCommentEditor(editor, "@rel");
    await act(async () => {
      await waitForSearchDebounce();
    });

    const agentOption = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));

    await act(async () => {
      agentOption?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });
    expect(editor.querySelector("[data-editor-mention='true']")).not.toBeNull();

    await typeIntoCommentEditor(editor, "@{Release bot without close");
    expect(editor.querySelector("[data-editor-mention='true']")).toBeNull();
    expect(
      document.querySelector("output[data-testid='comment-value']")?.textContent
    ).toBe("@{Release bot without close");

    const submitButton = findButtonByText("Add comment");

    await act(async () => {
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
