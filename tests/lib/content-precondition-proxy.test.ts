import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { proxy } from "@/proxy";
import { CONTENT_IF_MATCH_FORWARD_HEADER } from "@/lib/content-revision";

describe("content precondition forwarding", () => {
  test.each(["tasks", "meeting-notes", "context-cards"])("forwards %s write conditions to the database guard", (surface) => {
    const response = proxy(new NextRequest(`https://nexus.test/api/projects/p/${surface}/entity`, {
      method: "PATCH", headers: { "If-Match": '"task:entity:4"', [CONTENT_IF_MATCH_FORWARD_HEADER]: "forged" },
    }));
    expect(response.headers.get(`x-middleware-request-${CONTENT_IF_MATCH_FORWARD_HEADER}`)).toBe('"task:entity:4"');
    expect(response.headers.has("x-middleware-request-if-match")).toBe(false);
  });
  test("drops a forged internal validator when the public condition is absent", () => {
    const response = proxy(new NextRequest("https://nexus.test/api/projects/p/tasks/entity", {
      method: "PATCH", headers: { [CONTENT_IF_MATCH_FORWARD_HEADER]: "forged" },
    }));
    expect(response.headers.has(`x-middleware-request-${CONTENT_IF_MATCH_FORWARD_HEADER}`)).toBe(false);
  });
  test("preserves HTTP conditions outside the guarded content PATCH routes", () => {
    const response = proxy(new NextRequest("https://nexus.test/api/projects/p/tasks/entity/comments", {
      method: "POST", headers: { "If-Match": '"external:4"' },
    }));
    expect(response.headers.get("x-middleware-request-if-match")).toBe('"external:4"');
  });
});
