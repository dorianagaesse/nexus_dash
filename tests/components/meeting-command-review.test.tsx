// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const activityClientMock = vi.hoisted(() => ({
  fetchProjectActivityMutation: vi.fn(),
}));

vi.mock("@/lib/project-activity-client", () => ({
  fetchProjectActivityMutation: activityClientMock.fetchProjectActivityMutation,
  PROJECT_ACTIVITY_REMOTE_EVENT: "nexusdash:project-activity-remote",
}));

vi.mock("@/components/rich-text-editor", () => ({
  RichTextEditor: (props: any) => <textarea id={props.id} value={props.value} onInput={(event: any) => props.onChange(event.currentTarget.value)} />,
}));

import { ProjectMeetingNotesPanel } from "@/components/project-meeting-notes-panel";
import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { ToastProvider } from "@/components/toast-provider";
import { contentEtag } from "@/lib/content-revision";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function baseNote(overrides: Partial<ProjectMeetingNotePanelNote>): ProjectMeetingNotePanelNote {
  return {
    id: "note-1",
    contentRevision: 1,
    projectId: "project-1",
    title: "Rich prep review",
    scheduledAt: "2026-09-01T09:00:00.000Z",
    participants: [],
    labels: [],
    status: "actions_in_progress",
    inputNotes: "",
    outputNotes: "",
    decisions: "",
    actions: [],
    steward: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-08-31T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

const collaborators = [
  {
    id: "user-1",
    displayName: "Owner",
    usernameTag: "owner#0001",
    avatarSeed: "seed-owner",
    projectRole: "owner" as const,
  },
];

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function renderPanel(
  root: Root,
  notes: ProjectMeetingNotePanelNote[],
  canEdit: boolean,
  initialQuery: string | null = null
) {
  await act(async () => {
    root.render(
      <ToastProvider>
        <ProjectMeetingNotesPanel
          projectId="project-1"
          canEdit={canEdit}
          notes={notes}
          collaborators={collaborators}
          todoActors={[]}
          initialQuery={initialQuery}
        />
      </ToastProvider>
    );
  });
}

async function clickButtonLike(element: Element | null) {
  if (!element) {
    throw new Error("expected button element");
  }
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function findButton(container: Element, text: string): Element | null {
  return (
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

test("a command-only archive survives a stale content revision", async () => {
  vi.clearAllMocks();
  activityClientMock.fetchProjectActivityMutation.mockReset();
  const renderer = createTestRenderer();
  const note = baseNote({id: "note-stale-command", title: "Retro"});
  try {
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Retro"));
    await clickButtonLike(document.querySelector("button#meeting-status"));
    const done = Array.from(document.querySelectorAll("[role='option']")).find(el => el.textContent?.includes("Done"));
    await clickButtonLike(done ?? null);
    activityClientMock.fetchProjectActivityMutation
      .mockResolvedValueOnce({ok: false, status: 412, json: async () => ({error: "edit-conflict", current: {...note, contentRevision: 2, outputNotes: "Remote minutes"}})})
      .mockResolvedValueOnce({ok: true, json: async () => ({note: {...note, contentRevision: 3, outputNotes: "Remote minutes", status: "done"}})});
    await clickButtonLike(findButton(document.body, "Save notes"));
    // The rebased retry must carry the archive command and the surface may only
    // report success once the server accepted it.
    expect(activityClientMock.fetchProjectActivityMutation).toHaveBeenCalledTimes(2);
    expect(JSON.parse(activityClientMock.fetchProjectActivityMutation.mock.calls[1][2].body).status).toBe("done");
    expect(findButton(document.body, "Save notes")).toBeNull();
    expect(document.body.textContent).toContain("Meeting note archived.");
    expect(document.body.textContent).not.toContain(
      "changed elsewhere. Review the conflicting changes"
    );
  } finally {
    await act(async () => {renderer.root.unmount();});
    renderer.container.remove();
    document.body.innerHTML = "";
  }
});

test("a todo created in the drawer is reflected once the server assigns its id", async () => {
  vi.clearAllMocks();
  activityClientMock.fetchProjectActivityMutation.mockReset();
  const renderer = createTestRenderer();
  const note = baseNote({ id: "note-new-todo", title: "Retro" });
  try {
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Retro"));
    await clickButtonLike(findButton(document.body, "Add"));
    const todoInput = document.querySelector(
      "[aria-label='Todo 1']"
    ) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(todoInput, "Send recap");
      todoInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButtonLike(document.querySelector("button#meeting-status"));
    await clickButtonLike(
      Array.from(document.querySelectorAll("[role='option']")).find((el) =>
        el.textContent?.includes("Done")
      ) ?? null
    );
    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          ...note,
          contentRevision: 2,
          status: "done",
          actions: [
            {
              id: "server-todo-1",
              content: "Send recap",
              completedAt: null,
              position: 0,
            },
          ],
        },
      }),
    });
    await clickButtonLike(findButton(document.body, "Save notes"));
    const body = JSON.parse(
      activityClientMock.fetchProjectActivityMutation.mock.calls[0][2].body
    );
    expect(body.status).toBe("done");
    expect(body.actions).toEqual([
      { id: null, content: "Send recap", completedAt: null, assignee: null },
    ]);
    // The server-assigned id must not read as an unsynced command.
    expect(findButton(document.body, "Save notes")).toBeNull();
    expect(document.body.textContent).toContain("Meeting note archived.");
  } finally {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  }
});

test("adopting latest output does not silently discard a pending explicit archive", async () => {
  vi.clearAllMocks();
  activityClientMock.fetchProjectActivityMutation.mockReset();
  const renderer = createTestRenderer();
  const note = baseNote({id: "note-adopt-command", title: "Retro", outputNotes: "<p>Original</p>"});
  try {
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Retro"));
    const editor = document.querySelector("#meeting-outputs") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(editor, "<p>Local</p>");
      editor.dispatchEvent(new Event("input", {bubbles: true}));
    });
    await clickButtonLike(document.querySelector("button#meeting-status"));
    await clickButtonLike(Array.from(document.querySelectorAll("[role='option']")).find(el => el.textContent?.includes("Done")) ?? null);
    activityClientMock.fetchProjectActivityMutation
      .mockResolvedValueOnce({ok: false, status: 412, json: async () => ({error: "edit-conflict", current: {...note, contentRevision: 2, outputNotes: "<p>Remote</p>"}})})
      .mockResolvedValueOnce({ok: true, json: async () => ({note: {...note, contentRevision: 3, outputNotes: "<p>Remote</p>", status: "done"}})});
    await clickButtonLike(findButton(document.body, "Save notes"));
    expect(document.querySelector("[data-conflict-review]")).not.toBeNull();
    await clickButtonLike(findButton(document.body, "Use latest for all conflicts"));
    // Adopting latest discards the local output text but must still flush the
    // explicitly requested archive before the editor closes.
    expect(activityClientMock.fetchProjectActivityMutation).toHaveBeenCalledTimes(2);
    expect(JSON.parse(activityClientMock.fetchProjectActivityMutation.mock.calls[1][2].body).status).toBe("done");
    expect(findButton(document.body, "Save notes")).toBeNull();
    expect(document.body.textContent).toContain("Meeting note archived.");
  } finally {
    await act(async () => {renderer.root.unmount();});
    renderer.container.remove();
    document.body.innerHTML = "";
  }
});
