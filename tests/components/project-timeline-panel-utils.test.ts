import { describe, expect, test } from "vitest";

import {
  buildProjectTimelineRequestUrl,
  formatProjectTimelineChangeValue,
  formatProjectTimelineTimestamp,
  PROJECT_TIMELINE_PAGE_SIZE,
} from "@/components/project-timeline-panel-utils";

describe("project-timeline-panel-utils", () => {
  test("builds the history request url with the default page size", () => {
    expect(buildProjectTimelineRequestUrl({ projectId: "project-1" })).toBe(
      `/api/projects/project-1/history?take=${PROJECT_TIMELINE_PAGE_SIZE}`
    );
  });

  test("forwards the cursor and encodes the project identifier", () => {
    expect(
      buildProjectTimelineRequestUrl({
        projectId: "project 1",
        cursor: "cursor-2",
      })
    ).toBe(
      `/api/projects/project%201/history?take=${PROJECT_TIMELINE_PAGE_SIZE}&cursor=cursor-2`
    );
    expect(
      buildProjectTimelineRequestUrl({ projectId: "project-1", cursor: "  " })
    ).toBe(`/api/projects/project-1/history?take=${PROJECT_TIMELINE_PAGE_SIZE}`);
  });

  test("renders absent change values as a dash", () => {
    expect(formatProjectTimelineChangeValue(null)).toBe("—");
    expect(formatProjectTimelineChangeValue("")).toBe("—");
    expect(formatProjectTimelineChangeValue("   ")).toBe("—");
    expect(formatProjectTimelineChangeValue("Done")).toBe("Done");
  });

  test("formats valid timestamps and ignores invalid ones", () => {
    expect(formatProjectTimelineTimestamp("not-a-date")).toBe("");
    expect(
      formatProjectTimelineTimestamp("2026-09-18T10:00:00.000Z")
    ).not.toBe("");
  });
});
