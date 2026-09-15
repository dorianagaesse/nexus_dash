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
import type { KanbanTask } from "@/components/kanban-board-types";

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
  title:
    "Move the task overflow and close controls into the top-right corner of the task detail surface",
  description: null,
  deadlineDate: null,
  commentCount: 0,
  labels: [],
  blockedFollowUps: [],
  status: "Backlog",
  position: 0,
  archivedAt: null,
  attachments: [],
  relatedTasks: [],
  epic: null,
  assignee: {
    kind: "human",
    id: "assignee-1",
    displayName: "E2E Smoke User",
    usernameTag: "smoke#0001",
    avatarSeed: "assignee-1",
    status: "active",
    isAssignable: true,
  },
  createdBy: ownerSummary,
  updatedBy: ownerSummary,
  createdAt: "2026-05-31T09:00:00.000Z",
  updatedAt: "2026-05-31T09:00:00.000Z",
};

function buildModalProps() {
  return {
    projectId: "project-1",
    canEdit: true,
    isOpen: true,
    selectedTask: baseTask,
    isEditMode: false,
    editTitle: baseTask.title,
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
    taskComments: [],
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

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function renderModal(root: Root, overrides?: Partial<ModalProps>) {
  await act(async () => {
    root.render(<TaskDetailModal {...buildModalProps()} {...overrides} />);
  });
}

function clickElement(element: Element | null) {
  return act(async () => {
    element?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
}

function findButtonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === text
  );
}

function readHeaderLayout() {
  const controlsRow = document.querySelector<HTMLElement>(
    "[data-task-modal-controls='true']"
  );
  const topRow = controlsRow?.parentElement ?? null;

  return {
    controlsRow,
    topRow,
    contentBlock: topRow?.nextElementSibling ?? null,
  };
}

describe("TaskDetailModal header controls", () => {
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

  test("keeps the controls in the header's top row above the title and assignee blocks", async () => {
    const { root } = createTestRenderer();

    await renderModal(root);

    const { controlsRow, topRow, contentBlock } = readHeaderLayout();
    const title = document.querySelector("h3");
    const assigneeRow = document.querySelector("[data-task-assignee-badge='true']");

    expect(controlsRow).not.toBeNull();
    expect(topRow).not.toBeNull();
    expect(contentBlock).not.toBeNull();
    expect(title).not.toBeNull();
    expect(assigneeRow).not.toBeNull();

    expect(controlsRow?.querySelector("[aria-label='Task options']")).not.toBeNull();
    expect(controlsRow?.querySelector("[aria-label='Close task']")).not.toBeNull();

    // The title and assignee row flow below the controls instead of sharing
    // their row, so neither can displace or overlap the anchored controls.
    expect(topRow?.contains(title)).toBe(false);
    expect(contentBlock?.contains(title)).toBe(true);
    expect(controlsRow?.contains(assigneeRow)).toBe(false);
    expect(assigneeRow?.contains(controlsRow)).toBe(false);

    expect(
      topRow?.compareDocumentPosition(title as Node) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      topRow?.compareDocumentPosition(assigneeRow as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps the overflow actions and close behavior wired through the anchored controls", async () => {
    const { root } = createTestRenderer();
    const onClose = vi.fn();
    const onToggleEditMode = vi.fn();

    await renderModal(root, { onClose, onToggleEditMode });

    const { controlsRow } = readHeaderLayout();
    await clickElement(controlsRow?.querySelector("[aria-label='Task options']") ?? null);

    const editAction = findButtonByText("Edit");
    expect(editAction).toBeDefined();
    expect(findButtonByText("Delete")).toBeDefined();

    await clickElement(editAction ?? null);
    expect(onToggleEditMode).toHaveBeenCalledWith(true);

    await clickElement(controlsRow?.querySelector("[aria-label='Close task']") ?? null);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps the close control anchored above the title field while editing", async () => {
    const { root } = createTestRenderer();

    await renderModal(root, { isEditMode: true });

    const { controlsRow, contentBlock } = readHeaderLayout();
    const titleField = document.querySelector("[aria-label='Task title']");

    expect(controlsRow?.querySelector("[aria-label='Close task']")).not.toBeNull();
    expect(controlsRow?.querySelector("[aria-label='Task options']")).toBeNull();
    expect(titleField).not.toBeNull();
    expect(controlsRow?.contains(titleField)).toBe(false);
    expect(contentBlock?.contains(titleField)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
