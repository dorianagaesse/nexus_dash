// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AssigneeSelect } from "@/components/ui/assignee-select";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("AssigneeSelect", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
  });

  test("shows active agent credentials without submitting them as human assignees", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <AssigneeSelect
          value=""
          onChange={onChange}
          options={[
            {
              id: "user-1",
              displayName: "Alice",
              usernameTag: "alice#1234",
              avatarSeed: "alice-seed",
              projectRole: "editor",
              isOwner: false,
            },
          ]}
          agentOptions={[
            {
              kind: "agent",
              id: "credential-1",
              displayName: "Release bot",
              usernameTag: null,
              avatarSeed: null,
              status: "active",
              isAssignable: true,
            },
          ]}
        />
      );
    });

    act(() => {
      container.querySelector("button")?.click();
    });

    const agentOption = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[role='option']")
    ).find((option) => option.textContent?.includes("Release bot"));

    expect(agentOption).toBeDefined();
    expect(agentOption?.disabled).toBe(true);
    expect(agentOption?.getAttribute("aria-disabled")).toBe("true");
    expect(agentOption?.textContent).toContain("Agent");
    expect(onChange).not.toHaveBeenCalled();
  });
});
