// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AssigneeSelect } from "@/components/ui/assignee-select";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const humanOption = {
  id: "user-1",
  displayName: "Alice",
  usernameTag: "alice#1234",
  avatarSeed: "alice-seed",
  projectRole: "editor",
  isOwner: false,
} as const;

const agentOption = {
  kind: "agent",
  id: "credential-1",
  displayName: "Release bot",
  usernameTag: null,
  avatarSeed: null,
  status: "active",
  isAssignable: true,
} as const;

function findOption(label: string): HTMLButtonElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("[role='option']")
  ).find((option) => option.textContent?.includes(label));
}

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

  function renderSelect(
    props: Partial<React.ComponentProps<typeof AssigneeSelect>> = {}
  ) {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <AssigneeSelect
          value=""
          onChange={onChange}
          options={[humanOption]}
          agentOptions={[agentOption]}
          {...props}
        />
      );
    });

    act(() => {
      container.querySelector("button")?.click();
    });

    return onChange;
  }

  test("offers active agent credentials as selectable assignees", () => {
    const onChange = renderSelect();

    const renderedAgent = findOption("Release bot");

    expect(renderedAgent).toBeDefined();
    expect(renderedAgent?.disabled).toBe(false);
    expect(renderedAgent?.getAttribute("aria-disabled")).toBeNull();
    expect(renderedAgent?.textContent).toContain("Agent");

    act(() => {
      renderedAgent?.click();
    });

    expect(onChange).toHaveBeenCalledWith({
      kind: "agent",
      id: "credential-1",
    });
  });

  test("still emits human references for collaborator options", () => {
    const onChange = renderSelect();

    const renderedHuman = findOption("Alice");

    expect(renderedHuman).toBeDefined();
    expect(renderedHuman?.textContent).toContain("Editor");

    act(() => {
      renderedHuman?.click();
    });

    expect(onChange).toHaveBeenCalledWith({ kind: "human", id: "user-1" });
  });

  test("flags a stored non-assignable agent as needing reassignment", () => {
    renderSelect({
      value: {
        kind: "agent",
        id: "credential-gone",
        displayName: "Retired bot",
        usernameTag: null,
        avatarSeed: null,
        status: "revoked",
        isAssignable: false,
      },
    });

    const trigger = container.querySelector("button");

    expect(trigger?.textContent).toContain("Retired bot");
    expect(trigger?.textContent).toContain("Needs reassignment");
    expect(trigger?.getAttribute("title")).toBe("Retired bot");
    expect(
      trigger?.querySelector("[aria-label='Needs reassignment']")
    ).not.toBeNull();
  });
});
