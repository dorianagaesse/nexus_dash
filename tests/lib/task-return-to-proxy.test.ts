import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { proxy } from "../../proxy";

describe("shared task return destination", () => {
  test("overwrites caller-supplied destinations with the actual project URL", () => {
    const response = proxy(new NextRequest("https://nexus-dash.app/projects/demo?taskId=one", {
      headers: { "x-nexusdash-return-to": "https://example.com" },
    }));
    expect(response.headers.get("x-middleware-request-x-nexusdash-return-to"))
      .toBe("/projects/demo?taskId=one");
  });

  test("removes a caller-supplied destination from API requests", () => {
    const response = proxy(new NextRequest("https://nexus-dash.app/api/projects/demo", {
      headers: { "x-nexusdash-return-to": "/projects/other" },
    }));
    expect(response.headers.get("x-middleware-request-x-nexusdash-return-to")).toBeNull();
  });
});
