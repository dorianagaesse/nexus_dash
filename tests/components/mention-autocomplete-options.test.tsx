// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MentionAutocomplete } from "@/components/ui/mention-autocomplete";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("MentionAutocomplete actor options", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.querySelectorAll("[data-overlay-popover='true']").forEach((node) =>
      node.remove()
    );
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("renders humans and active credential labels from the actor search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          actors: [
            {
              kind: "human",
              id: "user-1",
              displayName: "Alice",
              usernameTag: "alice#1234",
              avatarSeed: "alice-seed",
              projectRole: "editor",
              isOwner: false,
            },
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
      })
    );
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <MentionAutocomplete
          projectId="project-1"
          query=""
          position={{ top: 20, left: 20 }}
          onSelect={onSelect}
          onClose={vi.fn()}
        />
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    const options = Array.from(document.querySelectorAll("[role='option']"));
    const human = options.find((option) => option.textContent?.includes("Alice"));
    const agent = options.find((option) =>
      option.textContent?.includes("Release bot")
    );

    expect(human?.getAttribute("aria-disabled")).toBe("false");
    expect(agent?.getAttribute("aria-disabled")).toBe("true");
    expect(agent?.textContent).toContain("Agent");
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-1/actors/search?query=",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  function stubActorSearch() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      })
    );
  }

  test("selects agents by click when agent mentions are enabled", async () => {
    stubActorSearch();
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <MentionAutocomplete
          projectId="project-1"
          query="rel"
          position={{ top: 20, left: 20 }}
          onSelect={onSelect}
          onClose={vi.fn()}
          agentMentionsEnabled
        />
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    const agent = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));

    expect(agent?.getAttribute("aria-disabled")).toBe("false");
    expect(agent?.textContent).not.toContain("coming soon");

    act(() => {
      agent?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      kind: "agent",
      id: "credential-1",
      displayName: "Release bot",
    });
  });

  test("selects agents with Enter when agent mentions are enabled", async () => {
    stubActorSearch();
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <MentionAutocomplete
          projectId="project-1"
          query="rel"
          position={{ top: 20, left: 20 }}
          onSelect={onSelect}
          onClose={vi.fn()}
          agentMentionsEnabled
        />
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      kind: "agent",
      id: "credential-1",
    });
  });
});
