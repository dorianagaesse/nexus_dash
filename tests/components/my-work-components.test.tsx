// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  MY_WORK_DEFAULT_FILTERS,
  MyWorkFilters,
  myWorkHref,
  type MyWorkFilterState,
} from "@/components/my-work/my-work-filters";
import { MyWorkList } from "@/components/my-work/my-work-list";
import {
  formatMyWorkRelativeTime,
  MyWorkRow,
} from "@/components/my-work/my-work-row";
import type {
  MyWorkItem,
  MyWorkResult,
} from "@/lib/services/my-work-service";

(globalThis as { React?: typeof React }).React = React;

const now = new Date("2026-10-05T12:00:00.000Z");

function taskItem(overrides: Partial<MyWorkItem> = {}): MyWorkItem {
  return {
    id: "task-1",
    type: "task",
    title: "Fix the login flow",
    projectId: "project-1",
    projectName: "Alpha",
    status: "In Progress",
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

function resultFixture(overrides: Partial<MyWorkResult> = {}): MyWorkResult {
  return {
    items: [taskItem()],
    total: 1,
    truncated: false,
    typeCounts: { all: 1, task: 1, todo: 0, note: 0 },
    projects: [{ id: "project-1", name: "Alpha", count: 1 }],
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

describe("myWorkHref", () => {
  test("returns the bare path for default filters", () => {
    expect(myWorkHref(MY_WORK_DEFAULT_FILTERS)).toBe("/my-work");
  });

  test("serializes non-default filters in a stable order", () => {
    const state: MyWorkFilterState = {
      assignment: "unassigned",
      type: "todo",
      projectId: "project-1",
      sort: "oldest",
      query: "launch recap",
    };

    expect(myWorkHref(state)).toBe(
      "/my-work?assignee=unassigned&type=todo&project=project-1&sort=oldest&q=launch+recap"
    );
  });

  test("override preserves the other filters and clears defaults", () => {
    const state: MyWorkFilterState = {
      assignment: "all",
      type: "task",
      projectId: "project-1",
      sort: "recent",
      query: "login",
    };

    expect(myWorkHref(state, { type: "all" })).toBe(
      "/my-work?assignee=all&project=project-1&q=login"
    );
    expect(myWorkHref(state, { projectId: null })).toBe(
      "/my-work?assignee=all&type=task&q=login"
    );
  });
});

describe("MyWorkRow", () => {
  test("renders a task row with type, link, project, status, assignee, and time", () => {
    const markup = renderToStaticMarkup(<MyWorkRow item={taskItem()} now={now} />);

    expect(markup).toContain('data-my-work-item-type="task"');
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

  test("renders todo status and steward-role notes", () => {
    const todo = renderToStaticMarkup(
      <MyWorkRow
        item={taskItem({ type: "todo", status: "Open", actor: null })}
        now={now}
      />
    );
    expect(todo).toContain("Open");
    expect(todo).toContain("Unassigned");

    const note = renderToStaticMarkup(
      <MyWorkRow
        item={taskItem({
          type: "note",
          status: "Actions in progress",
          actor: null,
          href: "/projects/project-1?meetingNoteId=note-1",
        })}
        now={now}
      />
    );
    expect(note).toContain("No facilitator");
    expect(note).toContain('data-identity-role="steward"');
  });
});

describe("MyWorkList", () => {
  test("renders rows with the item total", () => {
    const markup = renderToStaticMarkup(
      <MyWorkList result={resultFixture()} hasActiveFilters={false} now={now} />
    );

    expect(markup).toContain('data-my-work-list');
    expect(markup).toContain("Fix the login flow");
    expect(markup).toContain("Type");
    expect(markup).toContain("Assignee");
  });

  test("renders an empty state with a clear-filters link only when filtered", () => {
    const empty = resultFixture({
      items: [],
      total: 0,
      typeCounts: { all: 0, task: 0, todo: 0, note: 0 },
      projects: [],
    });

    const filtered = renderToStaticMarkup(
      <MyWorkList result={empty} hasActiveFilters={true} now={now} />
    );
    expect(filtered).toContain("No work items match these filters.");
    expect(filtered).toContain('href="/my-work"');

    const unfiltered = renderToStaticMarkup(
      <MyWorkList result={empty} hasActiveFilters={false} now={now} />
    );
    expect(unfiltered).not.toContain("Clear filters");
  });

  test("notes truncation when a type hit the fetch limit", () => {
    const markup = renderToStaticMarkup(
      <MyWorkList
        result={resultFixture({ truncated: true })}
        hasActiveFilters={false}
        now={now}
      />
    );

    expect(markup).toContain("Showing the first 200 items per type.");
  });
});

describe("MyWorkFilters", () => {
  test("links every assignment state and marks the active one", () => {
    const markup = renderToStaticMarkup(
      <MyWorkFilters
        filters={{ ...MY_WORK_DEFAULT_FILTERS, assignment: "reassignment" }}
        result={resultFixture()}
      />
    );

    expect(markup).toContain('aria-label="Assignment filter"');
    expect(markup).toContain('href="/my-work"');
    expect(markup).toContain('href="/my-work?assignee=unassigned"');
    expect(markup).toContain("Needs reassignment");
    expect(markup).toContain('aria-current="page"');
  });

  test("lists type and project facets with counts from the result", () => {
    const markup = renderToStaticMarkup(
      <MyWorkFilters
        filters={MY_WORK_DEFAULT_FILTERS}
        result={resultFixture({
          typeCounts: { all: 3, task: 2, todo: 1, note: 0 },
          projects: [{ id: "project-1", name: "Alpha", count: 3 }],
        })}
      />
    );

    expect(markup).toContain("All types (3)");
    expect(markup).toContain("Tasks (2)");
    expect(markup).toContain("Todos (1)");
    expect(markup).toContain("Notes (0)");
    expect(markup).toContain("Alpha (3)");
    expect(markup).toContain('data-my-work-filter="type"');
    expect(markup).toContain('data-my-work-filter="project"');
    expect(markup).toContain('data-my-work-filter="sort"');
  });

  test("preserves active filters in the search form and dropdown hrefs", () => {
    const filters: MyWorkFilterState = {
      assignment: "unassigned",
      type: "todo",
      projectId: null,
      query: "",
      sort: "recent",
    };
    const markup = renderToStaticMarkup(
      <MyWorkFilters filters={filters} result={resultFixture()} />
    );

    expect(markup).toContain('action="/my-work"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain('name="assignee" value="unassigned"');
    expect(markup).toContain('name="type" value="todo"');
    expect(markup).toContain("Search");
    expect(markup).toContain("Type: Todos");
  });
});
