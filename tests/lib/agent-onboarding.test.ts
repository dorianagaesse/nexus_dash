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

    expect(updateResponse.properties.task.$ref).toBe(
      "#/components/schemas/TaskRecord"
    );
  });

  test("documents the complete task create response contract", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");
    const createResponse = document.components.schemas.TaskCreateResponse;
    const updateResponse = document.components.schemas.TaskUpdateResponse;

    expect(createResponse.required).toEqual(["taskId", "task"]);
    expect(createResponse.properties.task.$ref).toBe(
      "#/components/schemas/TaskRecord"
    );
    expect(createResponse.properties.task.description).toContain(
      "follow-up read"
    );

    expect(updateResponse.required).toEqual(["task"]);
    expect(updateResponse.properties.task.$ref).toBe(
      "#/components/schemas/TaskRecord"
    );
  });

  test("documents true partial PATCH semantics for task updates", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");
    const updateRequest = document.components.schemas.TaskUpdateRequest;

    expect(updateRequest.required).toBeUndefined();
    expect(updateRequest.description).toContain("partial update");

    expect(updateRequest.properties.label.deprecated).toBe(true);
    expect(updateRequest.properties.deadlineDate.description).toContain("clears");
    expect(updateRequest.properties.labels.description).toContain("empty array clears");
    expect(updateRequest.properties.epicId.description).toContain("null clears");
    expect(updateRequest.properties.assigneeUserId.description).toContain(
      "null clears"
    );
    expect(updateRequest.properties.relatedTaskIds.description).toContain(
      "empty array removes"
    );
  });
});
