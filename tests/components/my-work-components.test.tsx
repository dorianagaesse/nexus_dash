// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  formatMyWorkRelativeTime,
  MyWorkRow,
} from "@/components/my-work/my-work-row";
import { MyWorkSection } from "@/components/my-work/my-work-section";
import {
  MY_WORK_VIEW_LABELS,
  MyWorkTabs,
} from "@/components/my-work/my-work-tabs";
import type { MyWorkItem } from "@/lib/services/my-work-service";

(globalThis as { React?: typeof React }).React = React;

const now = new Date("2026-10-05T12:00:00.000Z");

function taskItem(overrides: Partial<MyWorkItem> = {}): MyWorkItem {
  return {
    id: "task-1",
    type: "task",
    title: "Fix the login flow",
    projectId: "project-1",
    projectName: "Alpha",
    lane: "In Progress",
    actor: {
      kind: "human",
      id: "user-1",
      displayName: "Dorian",
      usernameTag: "dorian#1234",
      avatarSeed: null,
      status: "active",
      isAssignable: true,
    },
    needsReassignment: false,
    timestamp: new Date("2026-10-05T10:00:00.000Z"),
    href: "/projects/project-1?taskId=task-1",
    ...overrides,
  };
}

describe("formatMyWorkRelativeTime", () => {
  test("formats recent timestamps relative to now", () => {
    expect(
      formatMyWorkRelativeTime(new Date("2026-10-05T11:59:40.000Z"), now)
    ).toBe("just now");
    expect(
      formatMyWorkRelativeTime(new Date("2026-10-05T11:55:00.000Z"), now)
    ).toBe("5m ago");
    expect(
      formatMyWorkRelativeTime(new Date("2026-10-05T09:00:00.000Z"), now)
    ).toBe("3h ago");
    expect(
      formatMyWorkRelativeTime(new Date("2026-10-03T12:00:00.000Z"), now)
    ).toBe("2d ago");
  });

  test("falls back to an absolute date for older timestamps", () => {
    expect(
      formatMyWorkRelativeTime(new Date("2026-09-05T12:00:00.000Z"), now)
    ).toBe("Sep 5, 2026");
  });
});

describe("MyWorkRow", () => {
  test("renders a task row with link, project, lane, assignee, and time", () => {
    const markup = renderToStaticMarkup(<MyWorkRow item={taskItem()} now={now} />);

    expect(markup).toContain('href="/projects/project-1?taskId=task-1"');
    expect(markup).toContain("Fix the login flow");
    expect(markup).toContain("Alpha");
    expect(markup).toContain("In Progress");
    expect(markup).toContain("Dorian");
    expect(markup).toContain("2h ago");
    expect(markup).toContain('dateTime="2026-10-05T10:00:00.000Z"');
    expect(markup).not.toContain('aria-label="Needs reassignment"');
  });

  test("flags revoked assignees with the needs-reassignment indicator", () => {
    const markup = renderToStaticMarkup(
      <MyWorkRow
        item={taskItem({
          actor: {
            kind: "agent",
            id: "cred-1",
            displayName: "Codex bot",
            usernameTag: null,
            avatarSeed: null,
            status: "revoked",
            isAssignable: false,
          },
          needsReassignment: true,
        })}
        now={now}
      />
    );

    expect(markup).toContain('aria-label="Needs reassignment"');
    expect(markup).toContain("Codex bot");
  });

  test("renders unassigned tasks and steward-role notes", () => {
    const unassigned = renderToStaticMarkup(
      <MyWorkRow
        item={taskItem({ actor: null, lane: "Backlog" })}
        now={now}
      />
    );
    expect(unassigned).toContain("Unassigned");

    const note = renderToStaticMarkup(
      <MyWorkRow
        item={taskItem({
          type: "note",
          lane: null,
          actor: null,
          href: "/projects/project-1?meetingNoteId=note-1",
        })}
        now={now}
      />
    );
    expect(note).toContain("No facilitator");
  });
});

describe("MyWorkSection", () => {
  test("renders an empty state when no items match", () => {
    const markup = renderToStaticMarkup(
      <MyWorkSection
        name="tasks"
        title="Kanban tasks"
        emptyMessage="No kanban tasks in this view."
        section={{ count: 0, truncated: false, items: [] }}
        now={now}
      />
    );

    expect(markup).toContain("Kanban tasks");
    expect(markup).toContain("No kanban tasks in this view.");
  });

  test("marks truncated sections with a plus count and limit note", () => {
    const markup = renderToStaticMarkup(
      <MyWorkSection
        name="todos"
        title="Meeting todos"
        emptyMessage="No meeting todos in this view."
        section={{
          count: 200,
          truncated: true,
          items: [taskItem({ type: "todo", lane: null })],
        }}
        now={now}
      />
    );

    expect(markup).toContain("200+");
    expect(markup).toContain("Showing the first 200 items.");
  });
});

describe("MyWorkTabs", () => {
  test("links each view and marks the active one current", () => {
    const markup = renderToStaticMarkup(<MyWorkTabs activeView="reassignment" />);

    expect(markup).toContain('href="/my-work"');
    expect(markup).toContain('href="/my-work?view=unassigned"');
    expect(markup).toContain('href="/my-work?view=reassignment"');
    expect(markup).toContain('href="/my-work?view=recent"');
    expect(markup).toContain(MY_WORK_VIEW_LABELS.reassignment);
    expect(markup).toContain('aria-current="page"');
  });
});
