import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const stewardshipServiceMock = vi.hoisted(() => ({
  assignContextCardSteward: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/context-card-stewardship-service", () => ({
  assignContextCardSteward: stewardshipServiceMock.assignContextCardSteward,
}));

import { PATCH } from "@/app/api/projects/[projectId]/context-cards/[cardId]/stewardship/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("context card stewardship route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "test-user",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
  });

  test("assigns a human steward", async () => {
    const lastEditedAt = new Date("2026-07-20T12:00:00.000Z");
    stewardshipServiceMock.assignContextCardSteward.mockResolvedValueOnce({
      ok: true,
      data: {
        cardId: "card-1",
        steward: {
          kind: "human",
          id: "user-1",
          displayName: "Ada",
          usernameTag: "ada#0001",
          avatarSeed: "seed-ada",
          status: "active",
          isAssignable: true,
        },
        needsReview: false,
        thresholdDays: 90,
        lastEditedAt,
      },
    });

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steward: { kind: "human", id: "user-1" } }),
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.steward).toMatchObject({ kind: "human", id: "user-1" });
    expect(payload.review).toMatchObject({
      needsReview: false,
      thresholdDays: 90,
      lastEditedAt: lastEditedAt.toISOString(),
    });
    expect(stewardshipServiceMock.assignContextCardSteward).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      cardId: "card-1",
      steward: { kind: "human", id: "user-1" },
      agentAccess: undefined,
    });
  });

  test("clears the steward when null is sent", async () => {
    stewardshipServiceMock.assignContextCardSteward.mockResolvedValueOnce({
      ok: true,
      data: {
        cardId: "card-1",
        steward: null,
        needsReview: true,
        thresholdDays: 90,
        lastEditedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    });

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steward: null }),
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.steward).toBeNull();
    expect(payload.review).toMatchObject({ needsReview: true });
    expect(stewardshipServiceMock.assignContextCardSteward).toHaveBeenCalledWith(
      expect.objectContaining({ steward: null })
    );
  });

  test("rejects malformed steward references", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steward: { kind: "robot", id: "x" } }),
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "context-card-steward-invalid",
    });
    expect(stewardshipServiceMock.assignContextCardSteward).not.toHaveBeenCalled();
  });

  test("rejects requests that omit the steward key", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "context-card-stewardship-missing",
    });
    expect(stewardshipServiceMock.assignContextCardSteward).not.toHaveBeenCalled();
  });

  test("rejects invalid JSON payloads", async () => {
    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "Invalid JSON payload",
    });
    expect(stewardshipServiceMock.assignContextCardSteward).not.toHaveBeenCalled();
  });

  test("propagates service errors", async () => {
    stewardshipServiceMock.assignContextCardSteward.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "context-card-not-found",
    });

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/card-1/stewardship",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steward: null }),
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "card-1" },
    });

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "context-card-not-found",
    });
  });
});
