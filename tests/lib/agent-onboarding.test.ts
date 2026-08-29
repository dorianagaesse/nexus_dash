import { describe, expect, test } from "vitest";

import {
  AGENT_API_ENDPOINTS,
  buildAgentOpenApiDocument,
} from "@/lib/agent-onboarding";
import { MAX_BULK_TASK_OPERATIONS } from "@/lib/task-bulk";
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

  test("documents the bounded bulk task operations surface", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    const endpoint = AGENT_API_ENDPOINTS.find(
      (entry) => entry.path === "/api/projects/{projectId}/tasks/bulk"
    );
    expect(endpoint).toMatchObject({
      method: "POST",
      tag: "Tasks",
      requiredScopes: ["task:write"],
      requestContentType: "application/json",
    });
    expect(endpoint?.notes?.join(" ")).toContain(
      String(MAX_BULK_TASK_OPERATIONS)
    );

    const requestSchema = document.components.schemas.TaskBulkRequest;
    expect(requestSchema.required).toEqual(["operations"]);
    expect(requestSchema.properties.operations.minItems).toBe(1);
    expect(requestSchema.properties.operations.maxItems).toBe(
      MAX_BULK_TASK_OPERATIONS
    );
    const operationRefs = requestSchema.properties.operations.items.oneOf.map(
      (entry: { $ref: string }) => entry.$ref
    );
    expect(operationRefs).toEqual([
      "#/components/schemas/TaskBulkCreateOperation",
      "#/components/schemas/TaskBulkUpdateOperation",
      "#/components/schemas/TaskBulkStatusOperation",
    ]);

    expect(document.components.schemas.TaskBulkCreateOperation.properties.type.enum).toEqual([
      "create",
    ]);
    expect(document.components.schemas.TaskBulkUpdateOperation.required).toEqual([
      "type",
      "taskId",
      "changes",
    ]);
    expect(
      document.components.schemas.TaskBulkUpdateOperation.properties.changes.$ref
    ).toBe("#/components/schemas/TaskUpdateRequest");
    expect(document.components.schemas.TaskBulkStatusOperation.required).toEqual([
      "type",
      "taskId",
      "status",
    ]);

    const resultSchema = document.components.schemas.TaskBulkResult;
    expect(resultSchema.required).toEqual(["index", "ok", "status"]);
    expect(resultSchema.properties.task.$ref).toBe(
      "#/components/schemas/TaskRecord"
    );

    const path = document.paths["/api/projects/{projectId}/tasks/bulk"];
    expect(path.post.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TaskBulkRequest"
    );
    expect(path.post.responses[200].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TaskBulkResponse"
    );
  });
});
