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
import { ContextCardStewardPicker } from "@/components/context-panel/context-card-steward-picker";
import { ContextPreviewModal } from "@/components/context-panel/context-preview-modal";
import type {
  ProjectContextActorSummary,
  ProjectContextCard,
} from "@/components/project-context-panel-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const human: ProjectContextActorSummary = {
  kind: "human",
  id: "user-1",
  displayName: "Ada",
  usernameTag: "ada#0001",
  avatarSeed: "seed-ada",
  status: "active",
  isAssignable: true,
};

const inactiveAgent: ProjectContextActorSummary = {
  kind: "agent",
  id: "agent-1",
  displayName: "Release bot",
  usernameTag: null,
  avatarSeed: null,
  status: "revoked",
  isAssignable: false,
};

const card: ProjectContextCard = {
  id: "card-1",
  title: "Launch context",
  content: "<p>Notes</p>",
  color: "#ffffff",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  attachments: [],
  projection: {
    id: "card-1",
    creator: human,
    lastEditor: human,
    steward: null,
    review: {
      needsReview: true,
      thresholdDays: 90,
      lastEditedAt: "2026-05-01T00:00:00.000Z",
    },
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

describe("context card steward controls", () => {
  test("supports keyboard assignment and clearing with an accessible name", async () => {
    const onChange = vi.fn();
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardStewardPicker
          actors={[human]}
          selected={null}
          cleared
          disabled={false}
          onChange={onChange}
        />
      );
    });

    const trigger = document.querySelector<HTMLButtonElement>(
      "button[aria-label='Knowledge steward, current selection: Unassigned']"
    );
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());

    const search = document.querySelector<HTMLInputElement>("[role='combobox']");
    await act(async () => {
      search?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () => {
      search?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(human);

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button[aria-label='Clear steward']")?.click();
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    await act(async () => root.unmount());
  });

  test("disables assignment while a stewardship mutation is pending", async () => {
    const onChange = vi.fn();
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardStewardPicker
          actors={[human]}
          selected={human}
          cleared={false}
          disabled
          onChange={onChange}
        />
      );
    });
    expect(
      document.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']")?.disabled
    ).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("button[aria-label='Clear steward']")?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  test("uses actor avatars and calls out inactive stewards", async () => {
    const { root } = createRenderer();
    await act(async () => {
      root.render(
        <ContextCardActorChip
          actor={inactiveAgent}
          fallback="Unassigned"
          needsReassignment
        />
      );
    });
    expect(document.body.textContent).toContain("Needs reassignment");
    expect(document.querySelector("[data-agent-avatar='true']")).not.toBeNull();
    await act(async () => root.unmount());
  });

  test("keeps viewer previews read-only and exposes editor errors as alerts", async () => {
    const { root } = createRenderer();
    const props = {
      isOpen: true,
      card,
      attachments: [],
      assignableActors: [human],
      isUpdatingSteward: false,
      onClose: vi.fn(),
      onEdit: vi.fn(),
      onSelectSteward: vi.fn(),
      onPreviewAttachment: vi.fn(),
    };
    await act(async () => {
      root.render(<ContextPreviewModal {...props} canEdit={false} stewardError={null} />);
    });
    expect(document.querySelector("button[aria-haspopup='listbox']")).toBeNull();

    await act(async () => {
      root.render(
        <ContextPreviewModal
          {...props}
          canEdit
          stewardError="Could not update knowledge steward."
        />
      );
    });
    expect(document.querySelector("button[aria-haspopup='listbox']")).not.toBeNull();
    expect(document.querySelector("[role='alert']")?.textContent).toContain(
      "Could not update knowledge steward."
    );
    await act(async () => root.unmount());
  });
});
