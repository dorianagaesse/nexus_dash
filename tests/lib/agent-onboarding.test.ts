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

  test("documents the task list epic and label filters", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    const path = document.paths["/api/projects/{projectId}/tasks"].get;
    const queryParameters = path.parameters.filter(
      (parameter: { in?: string }) => parameter.in === "query"
    );
    expect(queryParameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      "epicId",
      "label",
    ]);
    expect(queryParameters.every((parameter: { required?: boolean }) => !parameter.required)).toBe(true);

    const listResponse = document.components.schemas.TaskListResponse;
    expect(listResponse.required).toEqual(["tasks", "filters"]);
    expect(listResponse.properties.filters.required).toEqual(["epicId", "label"]);
    expect(listResponse.properties.filters.properties.epicId.type).toEqual([
      "string",
      "null",
    ]);
    expect(listResponse.properties.filters.properties.label.type).toEqual([
      "string",
      "null",
    ]);
  });
});
