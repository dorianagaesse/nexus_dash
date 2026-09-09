// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ProjectMeetingNotesPanel } from "@/components/project-meeting-notes-panel";
import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { ToastProvider } from "@/components/toast-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function baseNote(overrides: Partial<ProjectMeetingNotePanelNote>): ProjectMeetingNotePanelNote {
  return {
    id: "note-1",
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
