// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import type { KanbanTask } from "@/components/kanban-board-types";

const capture = vi.hoisted(() => ({ grid: null as any, modal: null as any }));
vi.mock("@/components/kanban/kanban-columns-grid", () => ({
  KanbanColumnsGrid: (props: any) => {
    capture.grid = props;
    return null;
  },
}));
vi.mock("@/components/toast-provider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock("@/components/create-task-dialog", () => ({
  CreateTaskDialog: () => null,
}));
vi.mock("@/components/kanban/task-detail-modal", () => ({
  TaskDetailModal: (props: any) => {
    capture.modal = props;
    return props.selectedTask ? (
      <input
        aria-label="draft"
        value={props.editTitle}
        onChange={(e) => props.onEditTitleChange(e.target.value)}
      />
    ) : null;
  },
}));
vi.mock("@/components/kanban/kanban-board-header", () => ({
  KanbanBoardHeader: () => null,
}));
vi.mock("@/components/kanban/kanban-filter-bar", () => ({
  KanbanFilterBar: () => null,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("@/lib/hooks/use-recovery-draft", () => ({
  recoveryDraftKey: () => "draft",
  useRecoveryDraft: () => ({
    flush: vi.fn(),
    saved: vi.fn(),
    discard: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-project-section-expanded", () => ({
  useProjectSectionExpanded: () => ({
    isExpanded: true,
    setIsExpanded: vi.fn(),
  }),
}));
vi.mock("@/components/kanban/use-kanban-task-search", () => ({
  useKanbanTaskSearch: () => ({
    normalizedQuery: "",
    searchTaskIds: null,
    isLoading: false,
    error: null,
    retry: vi.fn(),
  }),
}));
vi.mock("@/lib/project-epic-client", () => ({
  PROJECT_EPICS_RECONCILED_EVENT: "project-epics-reconciled",
  reconcileProjectEpics: vi.fn(),
  reconcileProjectEpicsAfterTaskMutation: vi.fn(),
}));

import { KanbanBoard } from "@/components/kanban-board";
import { dispatchProjectActivityRemoteEvent } from "@/lib/project-activity-client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const person = {
  id: "owner",
  displayName: "Owner",
  usernameTag: null,
  avatarSeed: null,
};

function makeTasks(ids: string[]): KanbanTask[] {
  return ids.map((id, position) => ({
    id,
    reference: `ND-${position}`,
    title: id,
    description: null,
    deadlineDate: null,
    commentCount: 0,
    labels: [],
    blockedFollowUps: [],
    status: "Backlog",
    position,
    archivedAt: null,
    attachments: [],
    relatedTasks: [],
    epic: null,
    assignee: null,
    createdBy: person,
    updatedBy: person,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  })) as KanbanTask[];
}

test.each(["link", "file"])(
  "remote %s attachment deltas reconcile an open modal without replacing its draft or focus",
  async (kind) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ comments: [] }), { status: 200 })
        )
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <KanbanBoard
            canEdit
            projectId="project"
            actorUserId="owner"
            storageProvider="local"
            initialTasks={makeTasks(["a", "b"])}
            initialTaskId="a"
            archivedDoneTasks={[]}
            archivedEpics={[]}
            epics={[]}
            collaborators={[person]}
          />
        );
      });
      await act(async () => {
        capture.modal.onActivateEditMode();
      });
      await act(async () => {
        capture.modal.onEditTitleChange("Unfinished local title");
      });
      const input = container.querySelector("input")!;
      input.focus();
      const attachment = {
        id: "remote-1",
        commentId: null,
        kind,
        name: "Remote attachment",
        url: kind === "link" ? "https://example.com" : null,
        mimeType: kind === "file" ? "image/png" : null,
        sizeBytes: 10,
        downloadUrl: null,
      };
      const dispatch = (payload: unknown, projectId = "project") =>
        dispatchProjectActivityRemoteEvent({
          eventId: "remote",
          projectId,
          version: "2026-10-30T00:00:00Z",
          serverTime: "2026-10-30T00:00:00Z",
          actorUserId: "other",
          domain: "task",
          action: "updated",
          entityId: "a",
          payload,
        });
      await act(async () => {
        expect(dispatch({ taskId: "a", attachment })).toBe(true);
      });
      expect(capture.modal.selectedTask.attachments).toEqual([attachment]);
      expect(capture.grid.columns.Backlog[0].attachments).toEqual([attachment]);
      expect(capture.modal.editTitle).toBe("Unfinished local title");
      expect(document.activeElement).toBe(input);
      await act(async () => {
        expect(dispatch({ taskId: "a", attachment })).toBe(true);
      });
      expect(capture.modal.selectedTask.attachments).toHaveLength(1);
      await act(async () => {
        expect(
          dispatch(
            { taskId: "a", deletedAttachmentId: attachment.id },
            "another-project"
          )
        ).toBe(false);
      });
      expect(capture.modal.selectedTask.attachments).toHaveLength(1);
      await act(async () => {
        expect(
          dispatch({ taskId: "a", deletedAttachmentId: attachment.id })
        ).toBe(true);
      });
      expect(capture.modal.selectedTask.attachments).toEqual([]);
      expect(capture.grid.columns.Backlog[0].attachments).toEqual([]);
      expect(capture.modal.editTitle).toBe("Unfinished local title");
      expect(document.activeElement).toBe(input);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  }
);
