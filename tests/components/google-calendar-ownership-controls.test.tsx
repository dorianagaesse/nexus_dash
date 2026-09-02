import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { GoogleCalendarDisconnectControl } from "@/components/account/google-calendar-disconnect-control";
import { buildCalendarSummaryEventsUrl } from "@/components/project-dashboard/calendar-summary-stat-card";

(globalThis as { React?: typeof React }).React = React;

describe("Google Calendar ownership controls", () => {
  test("renders an explicit destructive disconnect action", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GoogleCalendarDisconnectControl)
    );

    expect(markup).toContain("Disconnect Google Calendar");
    expect(markup).toContain("min-h-11");
  });

  test("includes the project authorization context in summary requests", () => {
    expect(buildCalendarSummaryEventsUrl("project / one")).toBe(
      "/api/calendar/events?range=current-week&amp;projectId=project%20%2F%20one".replace(
        "&amp;",
        "&"
      )
    );
  });
});
