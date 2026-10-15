// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ConflictReview,
  formatLiveSaveFieldValue,
} from "@/components/live-save/conflict-review";
import type { LiveSaveConflict, LiveSaveConflictChoice } from "@/lib/live-save/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Fields extends Record<string, unknown> {
  title: string;
  description: string;
  labels: string[];
  priority: string;
}

const conflict: LiveSaveConflict<Fields> = {
  base: { title: "Original", description: "Base description", labels: ["a"], priority: "low" },
  local: { title: "My title", description: "My draft text", labels: ["a", "mine"], priority: "low" },
  latest: { title: "Their title", description: "Their description", labels: ["a"], priority: "high" },
  latestRevision: "r7",
  changedLocally: ["title", "description", "labels"],
  changedOnServer: ["title", "description", "priority"],
  conflictingFields: ["title", "description"],
};

const fieldMeta = {
  title: { label: "Title" },
  description: { label: "Description", richText: true },
  priority: { label: "Priority" },
} as const;

describe("formatLiveSaveFieldValue", () => {
  test("normalizes empties and stringifies structures without truncating", () => {
    expect(formatLiveSaveFieldValue(null)).toBe("(empty)");
    expect(formatLiveSaveFieldValue("")).toBe("(empty)");
    expect(formatLiveSaveFieldValue("short")).toBe("short");
    expect(formatLiveSaveFieldValue("x".repeat(300))).toBe("x".repeat(300));
    expect(formatLiveSaveFieldValue(["a", "b"])).toBe('["a","b"]');
    expect(formatLiveSaveFieldValue(42)).toBe("42");
  });
});

describe("ConflictReview", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onResolve: ReturnType<typeof vi.fn<(choices: Record<string, LiveSaveConflictChoice>) => void>>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onResolve = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (props: Partial<React.ComponentProps<typeof ConflictReview<Fields>>> = {}) => {
    await act(async () => {
      root.render(<ConflictReview<Fields> conflict={conflict} fieldMeta={fieldMeta} onResolve={onResolve} {...props} />);
    });
  };

  test("preserves both versions and never claims anything was overwritten", async () => {
    await render();
    const text = container.textContent!;
    expect(text).toContain("Someone else saved changes to this record while your draft was open. Nothing was overwritten; both versions are kept below.");
    // priority changed only on the server: shown as informational
    expect(text).toContain("Updated elsewhere (your draft did not touch these)");
    expect(text).toContain("Priority");
    expect(text).toContain("high");
    // labels changed only locally: saved as is
    expect(text).toContain("Your unsaved changes (saved as is)");
    expect(text).toContain('["a","mine"]');
    // conflicting fields show both versions, rich text is indivisible
    expect(text).toContain("My title");
    expect(text).toContain("Their title");
    expect(text).toContain("My draft text");
    expect(text).toContain("kept as a whole, never merged automatically");
  });

  test("defaults conflicting fields to the local version and submits per-field choices", async () => {
    await render();
    const radios = Array.from(container.querySelectorAll("input[type=radio]")) as HTMLInputElement[];
    // title group first, then description; local checked by default
    expect(radios).toHaveLength(4);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(radios[2].checked).toBe(true);
    expect(radios[3].checked).toBe(false);

    await act(async () => { radios[1].click(); });
    const apply = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply and save"
    ) as HTMLButtonElement;
    await act(async () => { apply.click(); });
    expect(onResolve).toHaveBeenCalledWith({ title: "latest", description: "local" });
  });

  test("offers keeping the local value which is submitted as a guarded write", async () => {
    await render();
    const apply = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply and save"
    ) as HTMLButtonElement;
    await act(async () => { apply.click(); });
    expect(onResolve).toHaveBeenCalledWith({ title: "local", description: "local" });
  });

  test("use-latest-for-all resolves every conflicting field without touching state", async () => {
    await render();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Use latest for all conflicts"
    ) as HTMLButtonElement;
    await act(async () => { button.click(); });
    expect(onResolve).toHaveBeenCalledWith({ title: "latest", description: "latest" });
  });

  test("shows pending state and disables actions while saving", async () => {
    await render({ pending: true });
    const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons.some((button) => button.textContent === "Saving...")).toBe(true);
  });
});
