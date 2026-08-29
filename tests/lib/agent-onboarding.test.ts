import { describe, expect, test } from "vitest";

import {
  AGENT_API_ENDPOINTS,
  buildAgentOpenApiDocument,
} from "@/lib/agent-onboarding";
import { TASK_STATUSES } from "@/lib/task-status";

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

  test("documents the single-task status transition surface", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    const endpoint = AGENT_API_ENDPOINTS.find(
      (entry) => entry.path === "/api/projects/{projectId}/tasks/{taskId}/status"
    );
    expect(endpoint).toMatchObject({
      method: "POST",
      tag: "Tasks",
      requiredScopes: ["task:write"],
      requestContentType: "application/json",
    });

    const requestSchema = document.components.schemas.TaskStatusTransitionRequest;
    expect(requestSchema.required).toEqual(["status"]);
    expect(requestSchema.properties.status.enum).toEqual(TASK_STATUSES);
    expect(requestSchema.properties.position).toMatchObject({
      type: "integer",
      minimum: 0,
    });

    const path = document.paths["/api/projects/{projectId}/tasks/{taskId}/status"];
    expect(path.post.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TaskStatusTransitionRequest"
    );
    expect(path.post.responses[200].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TaskStatusTransitionResponse"
    );
    expect(
      document.components.schemas.TaskStatusTransitionResponse.properties.task.$ref
    ).toBe("#/components/schemas/TaskRecord");
  });
});
