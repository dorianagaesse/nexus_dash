// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ImageAttachmentGrid } from "@/components/kanban/image-attachment-grid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ImageAttachmentGrid", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders accessible inline preview and remove controls", async () => {
    const onPreview = vi.fn();
    const onRemove = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImageAttachmentGrid
          attachments={[
            {
              id: "attachment-1",
              commentId: "comment-1",
              kind: "file",
              name: "repro.png",
              url: null,
              mimeType: "image/png",
              sizeBytes: 2048,
              downloadUrl: "/download/attachment-1",
            },
          ]}
          onPreview={onPreview}
          onRemove={onRemove}
        />
      );
    });

    const preview = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Preview image repro.png"]'
    );
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove image repro.png"]'
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "disposition=inline"
    );
    expect(remove?.className).toContain("h-11");

    await act(async () => {
      preview?.click();
      remove?.click();
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("attachment-1");

    await act(async () => root.unmount());
  });

  test("announces pending image uploads", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImageAttachmentGrid
          attachments={[]}
          pendingUploads={[
            { id: "pending-1", name: "paste.png", sizeBytes: 12, mimeType: "image/png" },
          ]}
          onPreview={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Uploading paste.png"
    );
    await act(async () => root.unmount());
  });
});
