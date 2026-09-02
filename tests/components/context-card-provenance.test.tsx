// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

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

import { ContextCardActorChip } from "@/components/context-panel/context-card-actor-chip";
import { ContextCardsGrid } from "@/components/context-panel/context-cards-grid";
import { ContextPreviewModal } from "@/components/context-panel/context-preview-modal";
import type {
  ProjectContextActorSummary,
  ProjectContextCard,
} from "@/components/project-context-panel-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const agent: ProjectContextActorSummary = {
  kind: "agent",
  id: "credential-1",
  displayName: "Release bot",
  usernameTag: null,
  avatarSeed: null,
  status: "active",
  isAssignable: true,
};

const human: ProjectContextActorSummary = {
  kind: "human",
  id: "user-1",
  displayName: "Ada",
  usernameTag: "ada#0001",
  avatarSeed: "seed-ada",
  status: "active",
  isAssignable: true,
};

const card: ProjectContextCard = {
  id: "card-1",
  title: "Launch context",
  content: "<p>Notes</p>",
  color: "#FDE2E4",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  attachments: [],
  projection: {
    id: "card-1",
    creator: agent,
    lastEditor: human,
    attachments: [],
  },
};

function createRenderer(): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { root: createRoot(container), container };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("context card provenance", () => {
  test("renders the agent avatar and credential label for agent actors", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardActorChip actor={agent} label="Created" fallback="Unknown" />
      );
    });
    expect(document.querySelector("[data-agent-avatar='true']")).not.toBeNull();
    expect(document.body.textContent).toContain("Created:");
    expect(document.body.textContent).toContain("Release bot");
    await act(async () => root.unmount());
  });

  test("renders the user avatar for human actors", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardActorChip actor={human} label="Last edit" fallback="No edits yet" />
      );
    });
    expect(document.querySelector("img[alt='']")).not.toBeNull();
    expect(document.body.textContent).toContain("Last edit:");
    expect(document.body.textContent).toContain("Ada");
    await act(async () => root.unmount());
  });

  test("shows the card timestamp next to the actor name", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardActorChip
          actor={agent}
          label="Created"
          fallback="Unknown"
          timestamp="2026-08-01T00:00:00.000Z"
        />
      );
    });
    expect(document.body.textContent).toMatch(/·\s*\d/);
    await act(async () => root.unmount());
  });

  test("falls back to a label when no actor is recorded", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardActorChip
          actor={null}
          label="Created"
          fallback="Unknown"
          timestamp="2026-08-01T00:00:00.000Z"
        />
      );
    });
    expect(document.body.textContent).toContain("Created: Unknown");
    expect(document.querySelector("[data-agent-avatar='true']")).toBeNull();
    await act(async () => root.unmount());
  });

  test("preview shows only created and last-edit provenance, no steward or review UI", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextPreviewModal
          canEdit
          isOpen
          card={card}
          attachments={[]}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onPreviewAttachment={vi.fn()}
        />
      );
    });
    expect(document.body.textContent).toContain("Created:");
    expect(document.body.textContent).toContain("Release bot");
    expect(document.body.textContent).toContain("Last edit:");
    expect(document.body.textContent).toContain("Ada");
    expect(document.body.textContent).not.toContain("Steward");
    expect(document.body.textContent).not.toContain("Needs review");
    expect(document.body.textContent).not.toContain("Reviewed");
    expect(document.querySelector("button[aria-haspopup='listbox']")).toBeNull();
    await act(async () => root.unmount());
  });

  test("grid cards show created and last-edit provenance without steward or review badges", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardsGrid
          canEdit
          cards={[card]}
          cardAttachmentsById={{ "card-1": [] }}
          deletingCardId={null}
          onOpenPreview={vi.fn()}
          onEditCard={vi.fn()}
          onDeleteCard={vi.fn()}
          onPreviewAttachment={vi.fn()}
        />
      );
    });
    expect(document.body.textContent).toContain("Created:");
    expect(document.body.textContent).toContain("Last edit:");
    expect(document.body.textContent).not.toContain("Steward");
    expect(document.body.textContent).not.toContain("Needs review");
    await act(async () => root.unmount());
  });
});
