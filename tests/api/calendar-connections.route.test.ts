import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const serviceMock = vi.hoisted(() => ({
  listCalendarConnections: vi.fn(),
  getCalendarPreference: vi.fn(),
  syncCalendarConnection: vi.fn(),
  disconnectCalendarConnection: vi.fn(),
  updateCalendarPreferences: vi.fn(),
}));

vi.mock("@/lib/services/calendar-connection-service", () => serviceMock);

import { GET } from "@/app/api/account/calendar-connections/route";
import { DELETE } from "@/app/api/account/calendar-connections/[connectionId]/route";
import { PATCH } from "@/app/api/account/calendar-preferences/route";

describe("Calendar connection account APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.listCalendarConnections.mockResolvedValue([]);
    serviceMock.getCalendarPreference.mockResolvedValue(null);
    serviceMock.disconnectCalendarConnection.mockResolvedValue({
      revocationStatus: "revoked",
    });
    serviceMock.updateCalendarPreferences.mockResolvedValue(undefined);
  });

  test("lists only through the authenticated actor context", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/account/calendar-connections")
    );
    expect(response.status).toBe(200);
    expect(serviceMock.listCalendarConnections).toHaveBeenCalledWith("test-user");
    expect(serviceMock.getCalendarPreference).toHaveBeenCalledWith("test-user");
  });

  test("disconnect scopes a forged connection id to the authenticated user", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/account/calendar-connections/foreign"),
      { params: Promise.resolve({ connectionId: "foreign" }) }
    );
    expect(response.status).toBe(200);
    expect(serviceMock.disconnectCalendarConnection).toHaveBeenCalledWith({
      userId: "test-user",
      connectionId: "foreign",
    });
  });

  test("preference writes discard non-string source ids before service validation", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/account/calendar-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selectedSourceIds: ["source-1", 42, null],
          writeSourceId: "source-1",
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(serviceMock.updateCalendarPreferences).toHaveBeenCalledWith({
      userId: "test-user",
      selectedSourceIds: ["source-1"],
      writeSourceId: "source-1",
    });
  });
});
