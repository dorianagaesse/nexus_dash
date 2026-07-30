// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";

import { MeetingTodoSidePanel } from "@/components/meeting-todos/meeting-todo-side-panel";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("meeting todo side panel", () => {
  test("stays out of mobile layout while remaining available on desktop", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MeetingTodoSidePanel
        notes={[
          {
            id: "meeting-1",
            projectId: "project-1",
            title: "Mobile review",
            scheduledAt: "2026-07-10T09:00:00.000Z",
            participants: [],
            labels: [],
            status: "actions_in_progress",
            inputNotes: "",
            outputNotes: "",
            actions: [
              {
                id: "todo-1",
                content: "Choose the mobile todo entry",
                completedAt: null,
                position: 0,
              },
            ],
            createdAt: "2026-07-10T08:00:00.000Z",
            updatedAt: "2026-07-10T10:00:00.000Z",
          },
        ]}
        canEdit
        referenceNowMs={new Date("2026-07-20T12:00:00.000Z").getTime()}
        pendingActionId={null}
        onOpenMeeting={vi.fn()}
        onSetCompleted={vi.fn()}
        />
      );
    });
    const result = document.body.innerHTML;

    expect(result).toContain('role="region"');
    expect(result).toContain("hidden");
    expect(result).toContain("lg:block");
    expect(result).toContain("Meeting todos");

    await act(async () => root.unmount());
    container.remove();
  });
});
