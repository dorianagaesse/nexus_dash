// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import type { KanbanTask } from "@/components/kanban-board-types";

const capture = vi.hoisted(() => ({ grid: null as any, modal: null as any, live: null as any }));
vi.mock("@/lib/hooks/use-live-save", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-live-save")>();
  return { ...actual, useLiveSave: (options: any) => {
    capture.live = options;
    return actual.useLiveSave(options);
  } };
});
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

test("activity snapshots refresh open comments and counts during task editing without touching drafts", async () => {
  const task = { ...makeTasks(["a"])[0], commentCount: 1 };
  const first = { id: "first", content: "<p>First</p>", createdAt: "2026-11-11T10:00:00Z", author: person };
  const second = { ...first, id: "second", content: "<p>Remote</p>", createdAt: "2026-11-11T10:01:00Z" };
  let comments = [first];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ comments, task }))));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<KanbanBoard canEdit projectId="project" actorUserId="owner" storageProvider="local" initialTasks={[task]} initialTaskId="a" archivedDoneTasks={[]} archivedEpics={[]} epics={[]} collaborators={[person]} />));
    await act(async () => {
      capture.modal.onActivateEditMode();
      capture.modal.onEditTitleChange("Unfinished local title");
      capture.modal.onNewTaskCommentChange("Unsent comment");
    });
    const input = container.querySelector("input")!;
    input.focus(); input.setSelectionRange(3, 9);
    comments = [{ ...first, content: "<p>Edited remotely</p>" }, second];
    await act(async () => {
      dispatchProjectActivityRemoteEvent({ projectId: "project", version: "2026-11-11T10:02:00Z", serverTime: "2026-11-11T10:02:00Z", eventId: null, domain: null, action: null, entityId: null, actorUserId: null, payload: null });
    });
    expect(capture.modal.taskComments.map((c: { id: string }) => c.id)).toEqual(["first", "second"]);
    expect(capture.modal.taskComments[0].content).toContain("Edited remotely");
    expect(capture.modal.selectedTask.commentCount).toBe(2);
    expect(capture.grid.columns.Backlog[0].commentCount).toBe(2);
    expect(capture.modal.editTitle).toBe("Unfinished local title");
    expect(capture.modal.newTaskComment).toBe("Unsent comment");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 9]);
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});

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

test("version-only polling reconciles the complete attachment list and aborts reads on modal close", async () => {
  const task = makeTasks(["a"])[0];
  const attachment = {
    id: "link",
    kind: "link",
    name: "Remote link",
    url: "https://example.com",
    commentId: null,
    mimeType: null,
    sizeBytes: null,
    downloadUrl: null,
  };
  let attachments = [attachment];
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({ task: { ...task, attachments }, comments: [] }),
        { status: 200 }
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const snapshot = (version: string) =>
    dispatchProjectActivityRemoteEvent({
      eventId: null,
      projectId: "project",
      version,
      serverTime: version,
      domain: null,
      action: null,
      actorUserId: null,
      entityId: null,
      payload: null,
    });
  try {
    await act(async () => {
      root.render(
        <KanbanBoard
          canEdit
          projectId="project"
          actorUserId="owner"
          storageProvider="local"
          initialTasks={[task]}
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
    await act(async () => {
      expect(snapshot("2026-10-30T10:00:00Z")).toBe(false);
    });
    expect(capture.modal.selectedTask.attachments).toEqual([attachment]);
    expect(capture.modal.editTitle).toBe("Unfinished local title");
    expect(document.activeElement).toBe(input);
    const requestCount = fetchMock.mock.calls.length;
    await act(async () => {
      snapshot("2026-10-30T10:00:00Z");
    });
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    attachments = [];
    await act(async () => {
      snapshot("2026-10-30T10:01:00Z");
    });
    expect(capture.modal.selectedTask.attachments).toEqual([]);
    expect(capture.modal.editTitle).toBe("Unfinished local title");
    expect(document.activeElement).toBe(input);
    let signal: AbortSignal | undefined;
    let resolveRead!: (response: Response) => void;
    fetchMock.mockImplementationOnce((_url?: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveRead = resolve;
      });
    });
    await act(async () => {
      snapshot("2026-10-30T10:02:00Z");
    });
    await act(async () => {
      capture.modal.onClose();
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveRead(
        new Response(
          JSON.stringify({ task: { ...task, attachments: [attachment] } })
        )
      );
    });
    expect(capture.modal.selectedTask).toBeNull();
    expect(capture.grid.columns.Backlog[0].attachments).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});


test.each([
  ["remote", "add"],
  ["remote", "delete"],
  ["local", "add"],
  ["local", "delete"],
  ["representation", "add"],
  ["representation", "delete"],
  ["patch", "add"],
  ["patch", "delete"],
  ["live-save", "add"],
  ["live-save", "delete"],
] as const)(
  "%s %s during reconciliation survives an older response and triggers a fresh read",
  async (source, operation) => {
    const attachment = {
      id: "changed-link",
      kind: "link",
      name: "Changed link",
      url: "https://example.com/changed",
      commentId: null,
      mimeType: null,
      sizeBytes: null,
      downloadUrl: null,
    };
    const missedAttachment = { ...attachment, id: "missed-link", name: "Missed link" };
    const task = {
      ...makeTasks(["a"])[0],
      attachments: operation === "delete" ? [attachment] : [],
    } as KanbanTask;
    const changedAttachments = operation === "add" ? [attachment] : [];
    const freshAttachments = [missedAttachment, ...changedAttachments];
    const reads: Array<(response: Response) => void> = [];
    const taskUrl = "/api/projects/project/tasks/a";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url, init) => {
      if (url === taskUrl && !init?.method) {
        return new Promise<Response>((resolve) => reads.push(resolve));
      }
      return new Response(JSON.stringify({ attachment, comments: [], task: { ...task, attachments: changedAttachments } }), { status: 200 });
    }));
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
            initialTasks={[task]}
            initialTaskId="a"
            archivedDoneTasks={[]}
            archivedEpics={[]}
            epics={[]}
            collaborators={[person]}
          />
        );
      });
      await act(async () => capture.modal.onActivateEditMode());
      await act(async () => capture.modal.onEditTitleChange("Unfinished local title"));
      const input = container.querySelector("input")!;
      input.focus();
      await act(async () => {
        dispatchProjectActivityRemoteEvent({
          eventId: null,
          projectId: "project",
          version: "2026-10-30T10:00:00Z",
          serverTime: "2026-10-30T10:00:00Z",
          domain: null, action: null, actorUserId: null, entityId: null, payload: null,
        });
      });
      expect(reads).toHaveLength(1);
      await act(async () => {
        if (source === "patch") {
          await capture.modal.onQuickEpicChange("");
        } else if (source === "live-save") {
          capture.live.onAccepted({
            representation: { task: { ...task, attachments: changedAttachments } },
            fullySynced: false,
          });
        } else if (source === "local") {
          if (operation === "add") {
            await capture.modal.onAddLinkAttachment(attachment.url);
          } else {
            capture.modal.onDeleteAttachment(attachment.id);
          }
        } else {
          dispatchProjectActivityRemoteEvent({
            eventId: "newer-event",
            projectId: "project",
            version: "2026-10-30T10:01:00Z",
            serverTime: "2026-10-30T10:01:00Z",
            domain: "task", action: "updated", actorUserId: "other", entityId: "a",
            payload: source === "representation"
              ? { task: { ...task, attachments: changedAttachments } }
              : { taskId: "a", ...(operation === "add" ? { attachment } : { deletedAttachmentId: attachment.id }) },
          });
        }
      });
      expect(capture.modal.selectedTask.attachments).toEqual(changedAttachments);
      await act(async () => {
        reads[0](new Response(JSON.stringify({ task })));
      });
      // The stale list must never replace the newer mutation, even while the
      // retry is still waiting. No further activity notification is required.
      expect(capture.modal.selectedTask.attachments).toEqual(changedAttachments);
      expect(capture.grid.columns.Backlog[0].attachments).toEqual(changedAttachments);
      expect(reads).toHaveLength(2);
      await act(async () => {
        reads[1](new Response(JSON.stringify({ task: { ...task, attachments: freshAttachments } })));
      });
      expect(capture.modal.selectedTask.attachments).toEqual(freshAttachments);
      expect(capture.grid.columns.Backlog[0].attachments).toEqual(freshAttachments);
      expect(capture.modal.editTitle).toBe("Unfinished local title");
      expect(document.activeElement).toBe(input);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  }
);


test.each(["local", "r2"] as const)("marks comment uploads as drafts with %s storage", async (storageProvider) => {
  const attachment = { id: "draft-file", kind: "file", name: "draft.txt", mimeType: "text/plain", commentId: null, sizeBytes: 5, downloadUrl: null, url: null };
  let draftIntent: unknown;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/upload-url")) return new Response(JSON.stringify({ upload: { storageKey: "key", uploadUrl: "https://storage.example/upload", method: "PUT", headers: {} } }));
    if (String(url).endsWith("/direct")) draftIntent = JSON.parse(String(init?.body)).isCommentDraft;
    if (init?.body instanceof FormData) draftIntent = init.body.get("isCommentDraft");
    return new Response(JSON.stringify({ attachment, comments: [] }));
  }));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<KanbanBoard canEdit projectId="project" actorUserId="owner" storageProvider={storageProvider} initialTasks={makeTasks(["a"])} initialTaskId="a" archivedDoneTasks={[]} archivedEpics={[]} epics={[]} collaborators={[person]} />));
    await act(async () => capture.modal.onAddCommentAttachments([new File(["draft"], "draft.txt", { type: "text/plain" })]));
    expect(draftIntent).toBe(storageProvider === "local" ? "true" : true);
    expect(capture.modal.commentAttachments).toEqual([attachment]);
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
