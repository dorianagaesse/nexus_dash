// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/comment-body-overflow", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/comment-body-overflow")>();

  return {
    ...actual,
    measureCommentBodyOverflow: vi.fn(),
  };
});

import { TaskCommentBody } from "@/components/kanban/task-comment-body";
import {
  COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM,
  measureCommentBodyOverflow,
} from "@/lib/comment-body-overflow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function renderBody(
  root: Root,
  props: { commentId: string; content: string; authorDisplayName?: string }
) {
  await act(async () => {
    root.render(
      <TaskCommentBody
        commentId={props.commentId}
        content={props.content}
        authorDisplayName={props.authorDisplayName}
      />
    );
  });
}

function getBodyElement(commentId: string): HTMLElement {
  const element = document.getElementById(`task-comment-body-${commentId}`);
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

function getToggleButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("button[aria-controls]");
}

describe("TaskCommentBody", () => {
  afterEach(() => {
    vi.mocked(measureCommentBodyOverflow).mockReset();
    document.body.innerHTML = "";
  });

  test("renders a short comment fully without a toggle when it does not overflow", async () => {
    vi.mocked(measureCommentBodyOverflow).mockReturnValue(false);
    const { root } = createTestRenderer();

    await renderBody(root, {
      commentId: "comment-short",
      content: "Short comment",
      authorDisplayName: "Avery",
    });

    const body = getBodyElement("comment-short");
    expect(body.textContent).toContain("Short comment");
    expect(body.style.maxHeight).toBe("");
    expect(body.style.overflow).toBe("");
    expect(getToggleButton()).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps long content visible without a toggle when measurement says it fits", async () => {
    vi.mocked(measureCommentBodyOverflow).mockReturnValue(false);
    const { root } = createTestRenderer();

    await renderBody(root, {
      commentId: "comment-fits",
      content: "x".repeat(2000),
      authorDisplayName: "Avery",
    });

    expect(getBodyElement("comment-fits").style.maxHeight).toBe("");
    expect(getToggleButton()).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  test("renders an overflowing comment collapsed with an accessible Show more toggle", async () => {
    vi.mocked(measureCommentBodyOverflow).mockReturnValue(true);
    const { root } = createTestRenderer();

    await renderBody(root, {
      commentId: "comment-long",
      content: "Long comment",
      authorDisplayName: "Avery",
    });

    const body = getBodyElement("comment-long");
    expect(body.style.maxHeight).toBe(
      `${COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM}rem`
    );
    expect(body.style.overflow).toBe("hidden");

    const toggle = getToggleButton();
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toContain("Show more");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe(
      "task-comment-body-comment-long"
    );
    expect(toggle?.getAttribute("aria-label")).toBe(
      "Show more of Avery's comment"
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("expands and re-collapses an overflowing comment from the toggle", async () => {
    vi.mocked(measureCommentBodyOverflow).mockReturnValue(true);
    const { root } = createTestRenderer();

    await renderBody(root, {
      commentId: "comment-long",
      content: "Long comment",
    });

    const toggle = getToggleButton();
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.click();
    });

    expect(getBodyElement("comment-long").style.maxHeight).toBe("");
    expect(toggle?.textContent).toContain("Show less");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      toggle?.click();
    });

    expect(getBodyElement("comment-long").style.maxHeight).toBe(
      `${COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM}rem`
    );
    expect(toggle?.textContent).toContain("Show more");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps the toggle label generic when no author display name is provided", async () => {
    vi.mocked(measureCommentBodyOverflow).mockReturnValue(true);
    const { root } = createTestRenderer();

    await renderBody(root, {
      commentId: "comment-long",
      content: "Long comment",
    });

    expect(getToggleButton()?.getAttribute("aria-label")).toBe("Show more");

    await act(async () => {
      root.unmount();
    });
  });
});
