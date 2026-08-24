import { describe, expect, test } from "vitest";

import {
  resolvePreferredWriteSourceId,
  type CalendarSourceOption,
} from "@/components/project-calendar-panel-utils";

const SOURCES: CalendarSourceOption[] = [
  {
    id: "source-first",
    connectionId: "connection-1",
    name: "First",
    color: null,
    writable: true,
  },
  {
    id: "source-preferred",
    connectionId: "connection-2",
    name: "Preferred",
    color: null,
    writable: true,
  },
];

describe("resolvePreferredWriteSourceId", () => {
  test("preserves the saved writable target instead of selecting the first source", () => {
    expect(resolvePreferredWriteSourceId(SOURCES, "source-preferred")).toBe(
      "source-preferred"
    );
  });

  test("falls back to the first writable source when the saved target is unavailable", () => {
    expect(resolvePreferredWriteSourceId(SOURCES, "source-missing")).toBe(
      "source-first"
    );
  });
});
