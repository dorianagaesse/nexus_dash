// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectsGridClient,
  type ProjectGridItem,
} from "@/app/projects/projects-grid-client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

const sampleProject: ProjectGridItem = {
  id: "project-1",
  role: "owner",
  name: "Launch Platform",
  description: "Core infrastructure and dashboard tools.",
  updatedAtLabel: "2 hours ago",
  taskCount: 5,
  resourceCount: 2,
};

async function enterEditMode(container: HTMLElement) {
  const optionsButton = container.querySelector(
    'button[aria-label="Project options"]'
  ) as HTMLButtonElement | null;
  await act(async () => {
    optionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const editButton = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Edit"
  );
  await act(async () => {
    editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ProjectsGridClient in-card edit affordance", () => {
  test("renders project card with primary CTA when in read-only mode", async () => {
    const { container, root } = createTestRenderer();
    const onUpdateProject = vi.fn();
    const onDeleteProject = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ProjectsGridClient, {
          projects: [sampleProject],
          onUpdateProject,
          onDeleteProject,
        })
      );
    });

    expect(container.textContent).toContain("Launch Platform");
    expect(container.textContent).toContain("Core infrastructure and dashboard tools.");
    expect(container.textContent).toContain("Open dashboard");

    // Edit form buttons should not be visible in read-only mode
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.some((b) => b.textContent?.includes("Cancel"))).toBe(false);
    expect(buttons.some((b) => b.textContent?.includes("Save changes"))).toBe(false);

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  test("enters in-card edit mode and renders Cancel with shared secondary button styling", async () => {
    const { container, root } = createTestRenderer();
    const onUpdateProject = vi.fn();
    const onDeleteProject = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ProjectsGridClient, {
          projects: [sampleProject],
          onUpdateProject,
          onDeleteProject,
        })
      );
    });

    await enterEditMode(container);

    // Now in edit mode
    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Cancel"
    );
    expect(cancelButton).not.toBeUndefined();

    // The Cancel button must have secondary button styling (bg-secondary text-secondary-foreground), NOT ghost
    expect(cancelButton?.className).toContain("bg-secondary");
    expect(cancelButton?.className).toContain("text-secondary-foreground");
    expect(cancelButton?.className).not.toContain("hover:bg-accent hover:text-accent-foreground border");

    // Before any changes are made (canSave is false), Save changes is not shown
    const saveButtonBeforeEdit = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Save changes")
    );
    expect(saveButtonBeforeEdit).toBeUndefined();

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  test("shows primary Save changes alongside secondary Cancel when form is dirty", async () => {
    const { container, root } = createTestRenderer();
    const onUpdateProject = vi.fn();
    const onDeleteProject = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ProjectsGridClient, {
          projects: [sampleProject],
          onUpdateProject,
          onDeleteProject,
        })
      );
    });

    await enterEditMode(container);

    // Change the name input to make it dirty
    const nameInput = container.querySelector(
      `#name-${sampleProject.id}`
    ) as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    await act(async () => {
      setInputValue(nameInput!, "Updated Project Name");
    });

    // Now Save changes should appear
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Save changes")
    );
    expect(saveButton).not.toBeUndefined();
    // Save changes uses primary button styling (bg-primary text-primary-foreground)
    expect(saveButton?.className).toContain("bg-primary");
    expect(saveButton?.className).toContain("text-primary-foreground");

    // Cancel button remains styled with secondary button styling
    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Cancel"
    );
    expect(cancelButton).not.toBeUndefined();
    expect(cancelButton?.className).toContain("bg-secondary");
    expect(cancelButton?.className).toContain("text-secondary-foreground");

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  test("clicking Cancel resets drafts and exits edit mode", async () => {
    const { container, root } = createTestRenderer();
    const onUpdateProject = vi.fn();
    const onDeleteProject = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ProjectsGridClient, {
          projects: [sampleProject],
          onUpdateProject,
          onDeleteProject,
        })
      );
    });

    await enterEditMode(container);

    const nameInput = container.querySelector(
      `#name-${sampleProject.id}`
    ) as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    await act(async () => {
      setInputValue(nameInput!, "Dirty Name Not Saved");
    });

    // Click Cancel
    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Cancel"
    );
    expect(cancelButton).not.toBeUndefined();

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Edit mode should be closed
    expect(container.querySelector(`#name-${sampleProject.id}`)).toBeNull();
    // Reverted back to persisted name
    expect(container.textContent).toContain("Launch Platform");
    expect(container.textContent).not.toContain("Dirty Name Not Saved");

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });
});
