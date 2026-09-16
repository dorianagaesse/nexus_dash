// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AttachmentFileList } from "@/components/kanban/attachment-file-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AttachmentFileList", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders nothing when there is no content", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AttachmentFileList attachments={[]} />);
    });

    expect(container.innerHTML).toBe("");
    await act(async () => root.unmount());
  });

  test("previews supported files and removes them on request", async () => {
    const onPreview = vi.fn();
    const onRemove = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AttachmentFileList
          attachments={[
            {
              id: "attachment-1",
              commentId: "comment-1",
              kind: "file",
              name: "spec.pdf",
              url: null,
              mimeType: "application/pdf",
              sizeBytes: 2048,
              downloadUrl: "/download/attachment-1",
            },
          ]}
          onPreview={onPreview}
          onRemove={onRemove}
        />
      );
    });

    expect(container.textContent).toContain("spec.pdf");
    expect(container.textContent).toContain("2.0 KB");

    const preview = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "spec.pdf"
    );
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove file spec.pdf"]'
    );
    expect(remove?.className).toContain("h-11");

    await act(async () => {
      preview?.click();
      remove?.click();
    });
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: "attachment-1", name: "spec.pdf" })
    );
    expect(onRemove).toHaveBeenCalledWith("attachment-1");

    await act(async () => root.unmount());
  });

  test("links non-previewable files to their download url", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AttachmentFileList
          attachments={[
            {
              id: "attachment-2",
              commentId: null,
              kind: "file",
              name: "notes.txt",
              url: null,
              mimeType: "text/plain",
              sizeBytes: 120,
              downloadUrl: "/download/attachment-2",
            },
          ]}
        />
      );
    });

    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe("/download/attachment-2");
    expect(link?.getAttribute("target")).toBeNull();

    await act(async () => root.unmount());
  });

  test("opens link attachments in a new tab", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AttachmentFileList
          attachments={[
            {
              id: "attachment-3",
              commentId: null,
              kind: "link",
              name: "design-reference",
              url: "https://example.com/design",
              mimeType: null,
              sizeBytes: null,
              downloadUrl: null,
            },
          ]}
        />
      );
    });

    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/design");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");

    await act(async () => root.unmount());
  });

  test("disables removals while uploads are pending", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AttachmentFileList
          attachments={[
            {
              id: "attachment-4",
              commentId: null,
              kind: "file",
              name: "budget.csv",
              url: null,
              mimeType: "text/csv",
              sizeBytes: 4096,
              downloadUrl: "/download/attachment-4",
            },
          ]}
          onRemove={vi.fn()}
          removeDisabled
        />
      );
    });

    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove file budget.csv"]'
    );
    expect(remove?.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  test("announces pending uploads with their size", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AttachmentFileList
          attachments={[]}
          pendingUploads={[
            { id: "pending-1", name: "report.pdf", sizeBytes: 2048, mimeType: "application/pdf" },
            { id: "pending-2", name: "unknown.bin", sizeBytes: 0 },
          ]}
        />
      );
    });

    const statuses = Array.from(container.querySelectorAll('[role="status"]'));
    expect(statuses).toHaveLength(2);
    expect(statuses[0]?.textContent).toContain("report.pdf");
    expect(statuses[0]?.textContent).toContain("Uploading 2.0 KB");
    expect(statuses[1]?.textContent).toContain("Uploading...");

    await act(async () => root.unmount());
  });
});
