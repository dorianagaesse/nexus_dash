import { describe, expect, test } from "vitest";

import {
  AGENT_API_ENDPOINTS,
  buildAgentOpenApiDocument,
} from "@/lib/agent-onboarding";

describe("agent-onboarding contract", () => {
  test("documents the scoped roadmap API surface", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    expect(
      AGENT_API_ENDPOINTS.filter((endpoint) => endpoint.tag === "Roadmap").map(
        (endpoint) => `${endpoint.method} ${endpoint.path}`
      )
    ).toEqual([
      "GET /api/projects/{projectId}/roadmap",
      "POST /api/projects/{projectId}/roadmap",
      "PATCH /api/projects/{projectId}/roadmap/phases/{phaseId}",
      "DELETE /api/projects/{projectId}/roadmap/phases/{phaseId}",
      "POST /api/projects/{projectId}/roadmap/phases/{phaseId}/events",
      "PATCH /api/projects/{projectId}/roadmap/events/{eventId}",
      "DELETE /api/projects/{projectId}/roadmap/events/{eventId}",
      "POST /api/projects/{projectId}/roadmap/phases/reorder",
      "POST /api/projects/{projectId}/roadmap/events/reorder",
      "POST /api/projects/{projectId}/roadmap/events/move",
    ]);

    expect(document.components.schemas.TokenExchangeResponse.properties.scopes.items.enum)
      .toEqual(
        expect.arrayContaining(["roadmap:read", "roadmap:write", "roadmap:delete"])
      );
    expect(document.paths["/api/projects/{projectId}/roadmap"].get).toBeDefined();
    expect(
      document.paths["/api/projects/{projectId}/roadmap/events/{eventId}"].delete
        .responses[200].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/RoadmapEventDeleteResponse");
  });

  test("documents the canonical task labels contract", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");
    const taskRecord = document.components.schemas.TaskRecord;
    const updateResponse = document.components.schemas.TaskUpdateResponse;

    expect(taskRecord.required).toContain("labels");
    expect(taskRecord.properties.labels).toEqual({
      type: "array",
      items: { type: "string" },
      description: expect.any(String),
    });
    expect(taskRecord.properties.label.deprecated).toBe(true);
    expect(taskRecord.properties.labelsJson.deprecated).toBe(true);

    const updateTaskSchema = updateResponse.properties.task;
    expect(updateTaskSchema.required).toContain("labels");
    expect(updateTaskSchema.properties.labels.type).toBe("array");
    expect(updateTaskSchema.properties.labels.items).toEqual({ type: "string" });
    expect(updateTaskSchema.properties.label.deprecated).toBe(true);
    expect(updateTaskSchema.properties.labelsJson.deprecated).toBe(true);
  });
});
