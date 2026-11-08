// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ProjectChecklist } from "@/components/project-checklist";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/project-activity-client", () => ({
  fetchProjectActivityMutation: mocks.mutate,
}));
(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const todo = {
  id: "one",
  content: "First item",
  completedAt: null,
  createdByUserId: "me",
  revision: 0,
};
const containers: HTMLElement[] = [];
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of containers.splice(0)) node.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
async function render(canEdit = true) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <ProjectChecklist
        projectId="project"
        actorUserId="me"
        initialData={{
          canEdit,
          canDelete: canEdit,
          todos: [
            todo,
            {
              ...todo,
              id: "two",
              content: "Other person's item",
              createdByUserId: "other",
            },
          ],
        }}
      />
    )
  );
  return container;
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("failed capture retains text for retry", async () => {
  mocks.mutate.mockResolvedValue(new Response("{}", { status: 500 }));
  const container = await render();
  const input = container.querySelector<HTMLInputElement>(
    "#checklist-new-item"
  )!;
  await type(input, "Keep my draft");
  await act(async () =>
    input.form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    )
  );
  expect(input.value).toBe("Keep my draft");
  expect(input.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not save"
  );
});

test("a remotely deleted item keeps its unsaved edit visible and recoverable", async () => {
  mocks.mutate.mockResolvedValue(new Response("{}", { status: 409 }));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ canEdit: true, canDelete: true, todos: [] })
        )
      )
  );
  const container = await render();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Edit: First item"]')!
      .click()
  );
  const edit = container.querySelector<HTMLInputElement>("#edit-one")!;
  await type(edit, "Recover this text");
  await act(async () =>
    edit.form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    )
  );
  expect(
    container.querySelector<HTMLTextAreaElement>("#checklist-recovery")?.value
  ).toBe("Recover this text");
  const recover = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Use text in a new item"
  )!;
  await act(async () => recover.click());
  expect(
    container.querySelector<HTMLInputElement>("#checklist-new-item")?.value
  ).toBe("Recover this text");
});

test("creator filter narrows shared items while viewers remain read-only", async () => {
  const container = await render(false);
  expect(container.querySelector("#checklist-new-item")).toBeNull();
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Complete: First item"]'
    )?.disabled
  ).toBe(true);
  const mine = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Created by me"))!
    .querySelector("input")!;
  await act(async () => mine.click());
  expect(container.textContent).toContain("First item");
  expect(container.textContent).not.toContain("Other person's item");
});
