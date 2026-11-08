// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ProjectMeetingTodos } from "@/components/meeting-todos/project-meeting-todos";
import type { ProjectTodoItem } from "@/lib/project-todo";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("@/lib/project-activity-client", () => ({
  fetchProjectActivityMutation: mocks.mutate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
  useSearchParams: () => mocks.search,
}));
(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const todo: ProjectTodoItem = {
  id: "one",
  content: "First item",
  completedAt: null,
  createdByUserId: "me",
  revision: 0,
};
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  mocks.search = new URLSearchParams();
  vi.resetAllMocks();
});
async function render(initial = [todo], canEdit = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  async function rerender(items: ProjectTodoItem[]) {
    await act(async () =>
      root.render(
        <ProjectMeetingTodos
          projectId="project"
          canEdit={canEdit}
          currentActorUserId="me"
          initialTodos={[]}
          personalTodos={{ todos: items, canEdit, canDelete: canEdit }}
        />
      )
    );
  }
  await rerender(initial);
  return { container, rerender };
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
async function click(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
test("capture explains privacy and retains failed input", async () => {
  mocks.mutate.mockResolvedValue(new Response("{}", { status: 500 }));
  const { container } = await render();
  expect(container.textContent).toContain(
    "Only you can see todos you add here."
  );
  const input = container.querySelector<HTMLInputElement>(
    "#personal-todo-content"
  )!;
  await type(input, "Keep this draft");
  await click(container, "Add todo");
  expect(input.value).toBe("Keep this draft");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not save"
  );
});

test("capture announces clean pending text and prevents duplicate submission", async () => {
  let finish!: (response: Response) => void;
  mocks.mutate.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  const { container } = await render();
  await type(container.querySelector<HTMLInputElement>("#personal-todo-content")!, "New item");
  await click(container, "Add todo");
  const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent === "Adding...");
  expect(button?.disabled).toBe(true);
  expect(container.querySelector<HTMLInputElement>("#personal-todo-content")?.disabled).toBe(true);
  await act(async () => finish(new Response(JSON.stringify({ todo: { ...todo, id: "new" } }))));
});
test("personal todos share the existing list, counts and assigned-to-me filter", async () => {
  mocks.search = new URLSearchParams("responsibility=mine");
  const { container, rerender } = await render();
  expect(
    container.querySelectorAll('section[aria-label="Open todos"] ul')
  ).toHaveLength(1);
  expect(container.textContent).toContain("First item");
  expect(container.textContent).toContain("1 open");
  mocks.search = new URLSearchParams("responsibility=unassigned");
  await rerender([todo]);
  expect(container.textContent).not.toContain("First item");
});
test("successful capture from completed view returns to the personal open queue", async () => {
  mocks.search = new URLSearchParams("view=completed");
  mocks.mutate.mockResolvedValue(
    new Response(JSON.stringify({ todo: { ...todo, id: "new" } }))
  );
  const { container } = await render();
  await type(
    container.querySelector<HTMLInputElement>("#personal-todo-content")!,
    "New item"
  );
  await click(container, "Add todo");
  expect(mocks.push).toHaveBeenCalledWith(
    "/projects/project/todos?responsibility=mine"
  );
});
test("a remotely removed item preserves its edit for recovery", async () => {
  const { container, rerender } = await render();
  await click(container, "Edit: First item");
  await type(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!,
    "Unsaved text"
  );
  await rerender([]);
  expect(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!.value
  ).toBe("Unsaved text");
  expect(container.textContent).toContain("This todo was deleted");
});
test("stale edits require reviewing the latest version without losing text", async () => {
  const { container, rerender } = await render();
  await click(container, "Edit: First item");
  await type(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!,
    "My draft"
  );
  await rerender([{ ...todo, content: "Latest saved", revision: 2 }]);
  expect(container.textContent).toContain("Latest saved text: Latest saved");
  await click(container, "Use latest version");
  expect(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!.value
  ).toBe("My draft");
  mocks.mutate.mockResolvedValue(
    new Response(
      JSON.stringify({ todo: { ...todo, content: "My draft", revision: 3 } })
    )
  );
  await click(container, "Save todo");
  expect(JSON.parse(mocks.mutate.mock.calls[0][2].body)).toEqual({
    content: "My draft",
    revision: 2,
  });
});
test("completing another item preserves an active edit", async () => {
  const second = { ...todo, id: "two", content: "Second item" };
  mocks.mutate.mockResolvedValue(
    new Response(
      JSON.stringify({
        todo: { ...second, completedAt: new Date().toISOString(), revision: 1 },
      })
    )
  );
  const { container } = await render([todo, second]);
  await click(container, "Edit: First item");
  await type(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!,
    "My draft"
  );
  await click(container, "Complete todo: Second item");
  expect(
    container.querySelector<HTMLInputElement>("#personal-todo-edit")!.value
  ).toBe("My draft");
});
test("read-only access hides personal write controls", async () => {
  const { container } = await render([todo], false);
  expect(container.querySelector("#personal-todo-content")).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Complete todo: First item"]'
    )!.disabled
  ).toBe(true);
  expect(
    container.querySelector('button[aria-label="Edit: First item"]')
  ).toBeNull();
});
