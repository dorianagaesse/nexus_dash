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

const richNote = baseNote({
  id: "note-rich",
  title: "Rich prep review",
  inputNotes: "<p>Agenda <strong>bolded</strong>.</p><ul><li>Alpha item</li></ul>",
  outputNotes: "<p>Backend <em>aligned</em>.</p>",
});

const legacyNote = baseNote({
  id: "note-legacy",
  title: "Legacy plain prep",
  inputNotes: "Legacy line one.\n\nLegacy line two.",
  outputNotes: "",
});

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("project-meeting-notes-panel rich sections", () => {
  let renderer: { container: HTMLDivElement; root: Root };

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTestRenderer();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  });

  test("renders plain-text card previews for rich and legacy notes without markup leakage", async () => {
    await renderPanel(renderer.root, [richNote, legacyNote], true);

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Rich prep review");
    expect(bodyText).toContain("Legacy plain prep");
    expect(bodyText).toContain("Alpha item");
    expect(bodyText).toContain("Legacy line one.");
    expect(bodyText).not.toContain("<strong>");
    expect(bodyText).not.toContain("<ul>");
    expect(bodyText).not.toContain("<li>");
  });

  test("filters cards when the query matches text inside rich HTML or legacy plain sections", async () => {
    await renderPanel(renderer.root, [richNote, legacyNote], true, "alpha item");

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Rich prep review");
    expect(bodyText).not.toContain("Legacy plain prep");

    await renderPanel(
      renderer.root,
      [richNote, legacyNote],
      true,
      "legacy line two"
    );
    const nextBodyText = document.body.textContent ?? "";
    expect(nextBodyText).toContain("Legacy plain prep");
    expect(nextBodyText).not.toContain("Rich prep review");
  });

  test("opens a rich note as a viewer with read-only sections and no editors", async () => {
    await renderPanel(renderer.root, [richNote], false);

    await clickButtonLike(findButton(renderer.container, "Rich prep review"));

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("Agenda");
    expect(dialogText).toContain("bolded");
    expect(dialogText).toContain("Backend");
    expect(dialogText).toContain("aligned");
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(document.body.textContent).not.toContain("No inputs captured.");
  });

  test("zooms rich input and output content independently for viewers", async () => {
    await renderPanel(renderer.root, [richNote], false);

    await clickButtonLike(findButton(renderer.container, "Rich prep review"));

    const inputs = document.querySelector<HTMLElement>(
      "[data-meeting-note-content='inputs']"
    );
    const outputs = document.querySelector<HTMLElement>(
      "[data-meeting-note-content='outputs']"
    );
    expect(inputs?.style.fontSize).toBe("14px");
    expect(outputs?.style.fontSize).toBe("14px");

    await clickButtonLike(
      document.querySelector("button[aria-label='Zoom in Inputs']")
    );
    expect(inputs?.style.fontSize).toBe("17.5px");
    expect(outputs?.style.fontSize).toBe("14px");

    await clickButtonLike(
      document.querySelector("button[aria-label='Zoom out Outputs']")
    );
    expect(inputs?.style.fontSize).toBe("17.5px");
    expect(outputs?.style.fontSize).toBe("10.5px");
    expect(inputs?.textContent).toContain("Agenda bolded");
    expect(outputs?.textContent).toContain("Backend aligned");
  });

  test("opens an empty legacy note with muted empty states", async () => {
    const emptyLegacy = baseNote({
      id: "note-empty",
      title: "Empty legacy prep",
      inputNotes: "",
      outputNotes: "",
    });
    await renderPanel(renderer.root, [emptyLegacy], false);

    await clickButtonLike(findButton(renderer.container, "Empty legacy prep"));

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("No inputs captured.");
    expect(dialogText).toContain("No outputs captured.");
  });

  test("editors can edit outputs in the note dialog and inputs through Edit prep", async () => {
    await renderPanel(renderer.root, [legacyNote], true);

    await clickButtonLike(findButton(renderer.container, "Legacy plain prep"));

    const outputsEditor = document.getElementById("meeting-outputs");
    expect(outputsEditor?.getAttribute("contenteditable")).toBe("true");
    expect(outputsEditor?.textContent ?? "").toBe("");
    expect(outputsEditor?.style.fontSize).toBe("14px");

    await clickButtonLike(
      document.querySelector("button[aria-label='Zoom in Outputs']")
    );
    expect(outputsEditor?.style.fontSize).toBe("17.5px");

    await clickButtonLike(findButton(document.body, "Edit prep"));

    const inputsEditor = document.getElementById("meeting-inputs");
    expect(inputsEditor?.getAttribute("contenteditable")).toBe("true");
    expect(inputsEditor?.style.fontSize).toBe("14px");
    expect(inputsEditor?.textContent).toContain("Legacy line one.");
    expect(inputsEditor?.textContent).toContain("Legacy line two.");
    expect(inputsEditor?.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
  });
});

describe("project-meeting-notes-panel guest stewardship", () => {
  let renderer: { container: HTMLDivElement; root: Root };

  const guest = {
    userId: null,
    displayName: "Camille",
    usernameTag: null,
    avatarSeed: null,
  };
  const guestSteward = {
    kind: "participant" as const,
    id: "Camille",
    displayName: "Camille",
    usernameTag: null,
    avatarSeed: null,
    status: "active" as const,
    isAssignable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTestRenderer();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  });

  test("toggles a guest participant steward from the note detail dialog", async () => {
    const note = baseNote({
      id: "note-guest",
      title: "Guest steward prep",
      participants: [guest],
    });
    await renderPanel(renderer.root, [note], true);

    await clickButtonLike(findButton(renderer.container, "Guest steward prep"));

    const makeSteward = document.querySelector(
      "button[aria-label='Make Camille steward / facilitator']"
    );
    expect(makeSteward).not.toBeNull();

    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note: { ...note, steward: guestSteward } }),
    });

    await clickButtonLike(makeSteward);

    expect(
      activityClientMock.fetchProjectActivityMutation
    ).toHaveBeenCalledWith(
      "project-1",
      "/api/projects/project-1/meeting-notes/note-guest/steward",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steward: { kind: "participant", id: "Camille" },
        }),
      }
    );
    const removeSteward = document.querySelector(
      "button[aria-label='Remove Camille as steward / facilitator']"
    );
    expect(removeSteward?.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain(
      "Camille is now stewarding this note."
    );

    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note }),
    });

    await clickButtonLike(removeSteward);

    expect(
      activityClientMock.fetchProjectActivityMutation
    ).toHaveBeenLastCalledWith(
      "project-1",
      "/api/projects/project-1/meeting-notes/note-guest/steward",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steward: null }),
      }
    );
    expect(
      document
        .querySelector("button[aria-label='Make Camille steward / facilitator']")
        ?.getAttribute("aria-pressed")
    ).toBe("false");
  });

  test("renders guest stewardship read-only for viewers", async () => {
    const note = baseNote({
      id: "note-guest-viewer",
      title: "Guest viewer prep",
      participants: [guest],
      steward: guestSteward,
    });
    await renderPanel(renderer.root, [note], false);

    await clickButtonLike(findButton(renderer.container, "Guest viewer prep"));

    expect(
      document.querySelector(
        "button[aria-label='Remove Camille as steward / facilitator']"
      )
    ).toBeNull();
    expect(
      document.querySelector(
        "[aria-label='Camille, steward / facilitator']"
      )
    ).not.toBeNull();
  });

  test("counts guest stewardship as stewarded but never as mine", async () => {
    const note = baseNote({
      id: "note-guest-filter",
      title: "Guest filter prep",
      participants: [guest],
      steward: guestSteward,
    });
    await renderPanel(renderer.root, [note], true);

    const labels = Array.from(
      document.querySelectorAll("nav[aria-label='Steward filter'] a")
    ).map((link) => link.textContent);
    expect(labels).toEqual(["All1", "Stewarded by me0", "Unstewarded0"]);
  });
});

describe("project-meeting-notes-panel todo reconciliation", () => {
  let renderer: { container: HTMLDivElement; root: Root };

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTestRenderer();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  });

  function todoNote() {
    return baseNote({
      id: "note-todos",
      title: "Sprint sync",
      actions: [
        {
          id: "action-a",
          content: "Audit navigation",
          completedAt: null,
          position: 0,
        },
        {
          id: "action-b",
          content: "Draft release notes",
          completedAt: null,
          position: 1,
        },
      ],
    });
  }

  function completionPayload(
    note: ProjectMeetingNotePanelNote,
    completions: Record<string, string | null>
  ) {
    return {
      ok: true,
      json: async () => ({
        note: {
          ...note,
          updatedAt: "2026-10-15T09:59:30.000Z",
          actions: note.actions.map((action) => ({
            ...action,
            completedAt: completions[action.id] ?? null,
          })),
        },
      }),
    };
  }

  test("keeps sibling completion state when a stale response arrives last", async () => {
    const note = todoNote();
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    activityClientMock.fetchProjectActivityMutation
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );

    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Sprint sync"));

    await clickButtonLike(
      document.querySelector("button[aria-label='Complete todo 1']")
    );
    await clickButtonLike(
      document.querySelector("button[aria-label='Complete todo 2']")
    );

    // First response: server processed both completions.
    await act(async () => {
      resolveFirst(
        completionPayload(note, {
          "action-a": "2026-10-15T09:59:20.000Z",
          "action-b": "2026-10-15T09:59:30.000Z",
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Second response was read before the first write committed: it only
    // knows about action-b and must not roll action-a back.
    await act(async () => {
      resolveSecond(
        completionPayload(note, {
          "action-b": "2026-10-15T09:59:30.000Z",
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      document.querySelector("button[aria-label='Reopen todo 1']")
    ).not.toBeNull();
    expect(
      document.querySelector("button[aria-label='Reopen todo 2']")
    ).not.toBeNull();
  });
});

describe("project-meeting-notes-panel visibility badge and toggle", () => {
  let renderer: { container: HTMLDivElement; root: Root };

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTestRenderer();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  });

  test("renders private and public badges on cards and defaults new notes to private with a working toggle", async () => {
    const privateNote = baseNote({
      id: "note-priv",
      title: "Private 1:1",
      visibility: "private",
      createdBy: {
        kind: "human",
        id: "user-1",
        displayName: "Owner",
        usernameTag: "owner#0001",
        avatarSeed: "seed-owner",
        status: "active",
        isAssignable: true,
      },
    });
    const publicNote = baseNote({
      id: "note-pub",
      title: "Team standup",
      visibility: "team",
      createdBy: {
        kind: "human",
        id: "user-2",
        displayName: "Editor",
        usernameTag: "editor#0002",
        avatarSeed: "seed-editor",
        status: "active",
        isAssignable: true,
      },
    });

    await act(async () => {
      renderer.root.render(
        <ToastProvider>
          <ProjectMeetingNotesPanel
            projectId="project-1"
            canEdit={true}
            currentActorUserId="user-1"
            notes={[privateNote, publicNote]}
            collaborators={collaborators}
            todoActors={[]}
          />
        </ToastProvider>
      );
    });

    const cardBadges = Array.from(
      renderer.container.querySelectorAll("[data-meeting-visibility]")
    ).map((el) => el.getAttribute("data-meeting-visibility"));
    expect(cardBadges).toEqual(expect.arrayContaining(["private", "public"]));

    // Open Prepare meeting dialog -> defaults to private
    await clickButtonLike(findButton(renderer.container, "Prepare meeting"));
    const prepareToggle = document.querySelector(
      "button[data-meeting-visibility-toggle]"
    );
    expect(prepareToggle?.getAttribute("data-meeting-visibility-toggle")).toBe(
      "private"
    );
    expect(prepareToggle?.textContent).toBe("private");

    // Toggle to public and back to private so draft is clean before Cancel
    await clickButtonLike(prepareToggle);
    expect(prepareToggle?.getAttribute("data-meeting-visibility-toggle")).toBe(
      "public"
    );
    expect(prepareToggle?.textContent).toBe("public");
    await clickButtonLike(prepareToggle);
    expect(prepareToggle?.getAttribute("data-meeting-visibility-toggle")).toBe(
      "private"
    );

    // Close Prepare dialog and open the non-creator's public note -> read-only badge, no toggle button
    await clickButtonLike(findButton(document.body, "Cancel"));
    await clickButtonLike(findButton(renderer.container, "Team standup"));
    expect(
      document.querySelector("button[data-meeting-visibility-toggle]")
    ).toBeNull();
  });
});

describe("project-meeting-notes-panel guarded explicit save", () => {
  let renderer: { container: HTMLDivElement; root: Root };

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTestRenderer();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.root.unmount();
    });
    renderer.container.remove();
    document.body.innerHTML = "";
  });

  test("saves preparation content through one conditional PATCH with explicit intent", async () => {
    const note = baseNote({ id: "note-save-prep", title: "Weekly sync" });
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Weekly sync"));
    await clickButtonLike(findButton(document.body, "Edit prep"));

    const titleInput = document.querySelector<HTMLInputElement>("#meeting-title");
    expect(titleInput).not.toBeNull();
    await act(async () => {
      setInputValue(titleInput as HTMLInputElement, "Weekly sync v2");
    });

    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: baseNote({
          id: "note-save-prep",
          title: "Weekly sync v2",
          contentRevision: 2,
        }),
      }),
    });

    await clickButtonLike(findButton(document.body, "Save preparation"));

    const call = activityClientMock.fetchProjectActivityMutation.mock.calls.at(-1);
    expect(call?.[0]).toBe("project-1");
    expect(call?.[1]).toBe("/api/projects/project-1/meeting-notes/note-save-prep");
    expect(call?.[2]).toMatchObject({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-content-if-match": contentEtag("meeting-note", "note-save-prep", 1),
        "NexusDash-Mutation-Intent": "explicit",
      },
      body: JSON.stringify({ title: "Weekly sync v2" }),
    });
    expect(call?.[2].signal).toBeInstanceOf(AbortSignal);
    expect(document.querySelector("#meeting-title")).toBeNull();
    expect(document.body.textContent).toContain(
      "Meeting preparation saved."
    );
  });

  test("keeps the preparation dialog open with a conflict review on 412", async () => {
    const note = baseNote({ id: "note-conflict", title: "Planning" });
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Planning"));
    await clickButtonLike(findButton(document.body, "Edit prep"));

    const titleInput = document.querySelector<HTMLInputElement>("#meeting-title");
    await act(async () => {
      setInputValue(titleInput as HTMLInputElement, "Planning locally");
    });

    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: false,
      status: 412,
      json: async () => ({
        error: "edit-conflict",
        current: baseNote({
          id: "note-conflict",
          title: "Planning remotely",
          contentRevision: 3,
        }),
      }),
    });

    await clickButtonLike(findButton(document.body, "Save preparation"));

    const conflictReview = document.querySelector("[data-conflict-review]");
    expect(conflictReview).not.toBeNull();
    expect(conflictReview?.textContent).toContain("Title");
    expect(document.querySelector("#meeting-title")).not.toBeNull();
    expect(findButton(document.body, "Save preparation")?.hasAttribute("disabled")).toBe(
      true
    );

    await clickButtonLike(findButton(document.body, "Use latest for all conflicts"));

    expect(document.querySelector("#meeting-title")).toBeNull();
    expect(document.body.textContent).toContain(
      "Meeting preparation saved."
    );
  });

  test("archives through an explicit status command without duplicating content fields", async () => {
    const note = baseNote({ id: "note-status", title: "Retro" });
    await renderPanel(renderer.root, [note], true);
    await clickButtonLike(findButton(renderer.container, "Retro"));

    await clickButtonLike(document.querySelector("button#meeting-status"));
    const doneOption = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Done"));
    expect(doneOption).toBeDefined();
    await clickButtonLike(doneOption ?? null);

    activityClientMock.fetchProjectActivityMutation.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: baseNote({
          id: "note-status",
          title: "Retro",
          status: "done",
          contentRevision: 2,
        }),
      }),
    });

    await clickButtonLike(findButton(document.body, "Save notes"));

    const call = activityClientMock.fetchProjectActivityMutation.mock.calls.at(-1);
    expect(call?.[2]).toMatchObject({
      method: "PATCH",
      headers: {
        "x-content-if-match": contentEtag("meeting-note", "note-status", 1),
        "NexusDash-Mutation-Intent": "explicit",
      },
      body: JSON.stringify({ status: "done" }),
    });
    expect(findButton(document.body, "Save notes")).toBeNull();
    expect(document.body.textContent).toContain("Meeting note archived.");
  });
});
