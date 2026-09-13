// @vitest-environment jsdom

import React, { act } from "react";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ProjectContextPanel } from "@/components/project-context-panel";
import type { ProjectContextCard } from "@/components/project-context-panel-types";
import type { MentionDisplayUser } from "@/components/ui/mention-hover-card";
import { ToastProvider } from "@/components/toast-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const collaborators: MentionDisplayUser[] = [
  {
    id: "user-ada",
    displayName: "Ada Lovelace",
    usernameTag: "ada#0001",
    avatarSeed: "seed-ada",
  },
];

function buildCard(overrides: Partial<ProjectContextCard>): ProjectContextCard {
  return {
    id: "card-1",
    title: "Launch context",
    content: "<p>Notes</p>",
    color: "#FDE2E4",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    attachments: [],
    projection: {
      id: "card-1",
      steward: null,
      creator: null,
      lastEditor: null,
      attachments: [],
    },
    ...overrides,
  };
}

const originalRangeGetClientRects = Range.prototype.getClientRects;

beforeEach(() => {
  window.localStorage.clear();
  // jsdom reports zero-sized range rects, which disables the editor's mention
  // trigger; report a real caret rect so the autocomplete can open.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: () => [{ width: 12, height: 12, top: 8, bottom: 20, left: 30, right: 42 }],
  });
});

afterEach(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: originalRangeGetClientRects,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function createTestRenderer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(
  root: Root,
  options: {
    cards: ProjectContextCard[];
    canEdit?: boolean;
    mentionCollaborators?: MentionDisplayUser[];
  }
) {
  await act(async () => {
    root.render(
      <ToastProvider>
        <ProjectContextPanel
          canEdit={options.canEdit ?? true}
          projectId="project-1"
          storageProvider="local"
          cards={options.cards}
          collaborators={options.mentionCollaborators ?? collaborators}
        />
      </ToastProvider>
    );
  });
}

function findButton(scope: Element, text: string): HTMLElement | null {
  return (
    Array.from(scope.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

async function clickElement(element: Element | null) {
  if (!element) {
    throw new Error("expected element to click");
  }
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function selectTextPosition(node: Node, offset: number) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

describe("project context panel mentions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const renderer = createTestRenderer();
    container = renderer.container;
    root = renderer.root;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("renders card mentions as chips in the grid and preview for collaborators", async () => {
    const card = buildCard({
      content: "<p>Ping @ada#0001 about the rollout.</p>",
    });
    await renderPanel(root, { cards: [card] });
    await clickElement(findButton(container, "Project context"));

    const gridMention = container.querySelector("[data-rich-mention='true']");
    expect(gridMention).not.toBeNull();
    expect(gridMention?.textContent).toBe("@ada");
    expect(container.textContent).toContain("about the rollout.");

    await clickElement(container.querySelector("article"));

    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    const previewMention = dialog?.querySelector("[data-rich-mention='true']");
    expect(previewMention).not.toBeNull();
    expect(previewMention?.textContent).toBe("@ada");
  });

  test("shows mention hover tooltips on grid chips from collaborators", async () => {
    const card = buildCard({
      content: "<p>Ping @ada#0001 about the rollout.</p>",
    });
    await renderPanel(root, { cards: [card] });
    await clickElement(findButton(container, "Project context"));

    const mention = container.querySelector("[data-rich-mention='true']");
    expect(mention).not.toBeNull();

    await act(async () => {
      mention?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Ada Lovelace");
    expect(document.body.textContent).toContain("ada#0001");
  });

  test("viewers see mention chips without edit affordances", async () => {
    const card = buildCard({
      content: "<p>Ping @ada#0001 about the rollout.</p>",
    });
    await renderPanel(root, { cards: [card], canEdit: false });
    await clickElement(findButton(container, "Project context"));

    expect(container.querySelector("[data-rich-mention='true']")).not.toBeNull();
    expect(findButton(container, "Add card")).toBeNull();
    expect(
      container.querySelector("button[aria-label='Context card options']")
    ).toBeNull();
  });

  test("completes a member mention in the add-card editor and submits the tagged token", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        requests.push({ url, init });
        if (url.includes("/actors/search")) {
          return Promise.resolve({
            ok: true,
            headers: new Headers(),
            json: vi.fn().mockResolvedValue({
              actors: [
                {
                  kind: "human",
                  id: "user-ada",
                  displayName: "Ada Lovelace",
                  usernameTag: "ada#0001",
                  avatarSeed: "seed-ada",
                  projectRole: "editor",
                  isOwner: false,
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers(),
          json: vi.fn().mockResolvedValue({
            cardId: "card-new",
            card: {
              id: "card-new",
              title: "Rollout context",
              content: "<p>@ada#0001 please review.</p>",
              color: "#FDE2E4",
              createdAt: "2026-09-13T00:00:00.000Z",
              updatedAt: "2026-09-13T00:00:00.000Z",
              attachments: [],
              projection: {
                id: "card-new",
                steward: null,
                creator: null,
                lastEditor: null,
                attachments: [],
              },
            },
          }),
        });
      })
    );

    await renderPanel(root, { cards: [] });
    await clickElement(findButton(container, "Add card"));

    const editor = document.getElementById("context-create-content");
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute("contenteditable")).toBe("true");

    await act(async () => {
      editor!.textContent = "@ad";
      selectTextPosition(editor!.firstChild as Text, 3);
      editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () => {
      await sleep(250);
    });

    const searchRequest = requests.find((request) =>
      request.url.includes("/actors/search")
    );
    expect(searchRequest).toBeDefined();
    expect(searchRequest?.url).toContain(
      "/api/projects/project-1/actors/search"
    );
    expect(searchRequest?.url).toContain("query=ad");

    const option = Array.from(document.querySelectorAll("[role='option']")).find(
      (element) => element.textContent?.includes("Ada Lovelace")
    );
    expect(option).toBeDefined();

    await clickElement(option ?? null);
    const editorMention = editor?.querySelector("[data-editor-mention='true']");
    expect(editorMention).not.toBeNull();
    expect(editorMention?.getAttribute("data-mention-raw")).toBe("@ada#0001");
    expect(editor?.textContent).toContain("@ada");

    const hiddenContent = document.querySelector<HTMLInputElement>(
      "input[name='content']"
    );
    expect(hiddenContent?.value).toContain("@ada#0001");

    const titleInput = document.getElementById(
      "context-create-title"
    ) as HTMLInputElement | null;
    expect(titleInput).not.toBeNull();
    titleInput!.value = "Rollout context";

    await clickElement(findButton(document.body, "Create card"));
    await act(async () => {
      await sleep(0);
    });

    const postRequest = requests.find((request) => request.init?.method === "POST");
    expect(postRequest).toBeDefined();
    const body = postRequest?.init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(String(body.get("content"))).toContain("@ada#0001");
  });

  test("opens the edit modal for legacy plain-text cards with upgraded paragraphs", async () => {
    const card = buildCard({
      content: "Legacy line one.\n\nLegacy line two.",
    });
    await renderPanel(root, { cards: [card] });
    await clickElement(findButton(container, "Project context"));

    expect(container.textContent).toContain("Legacy line one.");
    expect(container.textContent).toContain("Legacy line two.");
    expect(container.textContent).not.toContain("<p>");

    await clickElement(
      container.querySelector("button[aria-label='Context card options']")
    );
    await clickElement(findButton(document.body, "Edit"));

    const editor = document.getElementById("context-edit-content");
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute("contenteditable")).toBe("true");
    expect(editor?.textContent).toContain("Legacy line one.");
    expect(editor?.textContent).toContain("Legacy line two.");
    expect(editor?.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
  });
});
