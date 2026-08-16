// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  MeetingTodoAssigneeChip,
  MeetingTodoAssigneeChipReadonly,
} from "@/components/meeting-todos/meeting-todo-assignee-chip";
import type {
  MeetingTodoActorReference,
  MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HUMANS: MeetingTodoActorSummary[] = [
  {
    kind: "human",
    id: "user-1",
    displayName: "owner",
    usernameTag: "owner#0001",
    avatarSeed: "seed-owner",
    status: "active",
    isAssignable: true,
  },
  {
    kind: "human",
    id: "user-2",
    displayName: "camille",
    usernameTag: "camille#0042",
    avatarSeed: "seed-camille",
    status: "active",
    isAssignable: true,
  },
];

const INACTIVE_HUMAN: MeetingTodoActorSummary = {
  kind: "human",
  id: "user-3",
  displayName: "former collaborator",
  usernameTag: null,
  avatarSeed: "seed-former",
  status: "inactive",
  isAssignable: false,
};

const AGENT: MeetingTodoActorSummary = {
  kind: "agent",
  id: "agent-1",
  displayName: "Release:bot",
  usernameTag: null,
  avatarSeed: null,
  status: "active",
  isAssignable: true,
};

interface HarnessProps {
  initialValue?: MeetingTodoActorReference | null;
  options?: MeetingTodoActorSummary[];
  bordered?: boolean;
}

function Harness({
  initialValue = null,
  options = HUMANS,
  bordered = true,
}: HarnessProps) {
  const [value, setValue] = React.useState<MeetingTodoActorReference | null>(
    initialValue
  );
  return (
    <MeetingTodoAssigneeChip
      id="assignee-chip"
      value={value}
      options={options}
      onChange={setValue}
      bordered={bordered}
    />
  );
}

describe("meeting-todo-assignee-chip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("renders the unassigned placeholder when no value is set", () => {
    act(() => {
      root.render(<Harness />);
    });
    const chip = container.querySelector(
      "[data-meeting-todo-assignee-chip='true']"
    );
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Unassigned");
    expect(chip?.getAttribute("aria-haspopup")).toBe("listbox");
  });

  test("renders the assigned actor's display name", () => {
    act(() => {
      root.render(
        <Harness
          initialValue={{ kind: "human", id: "user-2" }}
          options={HUMANS}
        />
      );
    });
    expect(container.textContent).toContain("camille");
  });

  test("marks the chip as needing reassignment for inactive actors", () => {
    act(() => {
      root.render(
        <Harness
          initialValue={{ kind: "human", id: "user-3" }}
          options={[...HUMANS, INACTIVE_HUMAN]}
        />
      );
    });
    const chip = container.querySelector(
      "[data-meeting-todo-assignee-chip='true']"
    );
    expect(chip?.getAttribute("data-needs-reassignment")).toBe("true");
    expect(container.textContent).toContain("former collaborator");
  });

  test("opens the popover, lists project members and agents, and selects one", async () => {
    act(() => {
      root.render(<Harness options={[...HUMANS, AGENT]} />);
    });

    const chip = container.querySelector(
      "[data-meeting-todo-assignee-chip='true']"
    ) as HTMLButtonElement;
    expect(chip).not.toBeNull();
    await act(async () => {
      chip.click();
      await Promise.resolve();
    });

    const listbox = document.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox?.textContent).toContain("Project members");
    expect(listbox?.textContent).toContain("Project agents");
    expect(listbox?.textContent).toContain("owner");
    expect(listbox?.textContent).toContain("Release:bot");

    const ownerOption = Array.from(
      listbox?.querySelectorAll('[role="option"]') ?? []
    ).find((option) => option.textContent?.includes("owner#0001")) as
      | HTMLButtonElement
      | undefined;
    expect(ownerOption).toBeDefined();
    await act(async () => {
      ownerOption?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("owner");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  test("readonly chip renders the display name without an interactive trigger", () => {
    act(() => {
      root.render(
        <MeetingTodoAssigneeChipReadonly
          actor={{
            kind: "human",
            id: "user-2",
            displayName: "camille",
            usernameTag: "camille#0042",
            avatarSeed: "seed-camille",
            status: "active",
            isAssignable: true,
          }}
        />
      );
    });

    const chip = container.querySelector(
      "[data-meeting-todo-assignee-chip='true']"
    );
    expect(chip).toBeNull();
    expect(container.textContent).toContain("camille");
  });

  test("renders without an outer border when bordered={false}", () => {
    act(() => {
      root.render(
        <Harness
          initialValue={{ kind: "human", id: "user-2" }}
          options={HUMANS}
          bordered={false}
        />
      );
    });
    const trigger = container.querySelector(
      "[data-meeting-todo-assignee-chip='true']"
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.className).not.toMatch(/\bborder\b/);
    expect(container.textContent).toContain("camille");
  });
});
