import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { CalendarConnectionsManager } from "@/components/account/calendar-connections-manager";

describe("CalendarConnectionsManager", () => {
  test("renders accessible account, selection, writable-target, and recovery controls", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectionsManager
        writeSourceId="source-owner"
        connections={[
          {
            id: "connection-1",
            provider: "google",
            accountEmail: "person@example.com",
            accountLabel: "person@example.com",
            reauthorizationRequiredAt: "2026-08-06T10:00:00.000Z",
            calendarListSyncedAt: null,
            sources: [
              {
                id: "source-owner",
                name: "Personal",
                color: "#4285f4",
                accessRole: "owner",
                isPrimary: true,
                isSelected: true,
              },
              {
                id: "source-reader",
                name: "Company holidays",
                color: null,
                accessRole: "reader",
                isPrimary: false,
                isSelected: true,
              },
            ],
          },
        ]}
      />
    );

    expect(html).toContain("Add Google account");
    expect(html).toContain("Reauthorization required");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('aria-label="Use Personal for new events"');
    expect(html).toContain(
      'aria-label="Use Company holidays for new events" title="Read-only calendar" type="radio" disabled=""'
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("Disconnect");
  });
});
