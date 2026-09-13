import { describe, expect, test } from "vitest";

import {
  AGENT_API_ENDPOINTS,
  buildAgentAttentionExample,
  buildAgentOpenApiDocument,
} from "@/lib/agent-onboarding";
import {
  AGENT_ATTENTION_ASSIGNMENT_STATES,
  AGENT_ATTENTION_DEFAULT_LIMIT,
  AGENT_ATTENTION_MAX_LIMIT,
  AGENT_ATTENTION_ORDERS,
} from "@/lib/agent-attention";
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

  test("documents tagged-agent selections on task comment creation", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    const endpoint = AGENT_API_ENDPOINTS.find(
      (entry) =>
        entry.method === "POST" &&
        entry.path === "/api/projects/{projectId}/tasks/{taskId}/comments"
    );
    expect(endpoint).toMatchObject({
      tag: "Tasks",
      requiredScopes: ["task:write"],
      requestContentType: "application/json",
    });
    expect(endpoint?.notes?.join(" ")).toContain("agentMentionSelections");

    const requestSchema = document.components.schemas.TaskCommentCreateRequest;
    expect(requestSchema.required).toEqual(["content"]);
    expect(requestSchema.properties.agentMentionSelections.maxItems).toBe(50);
    expect(
      requestSchema.properties.agentMentionSelections.items.required
    ).toEqual(["credentialId"]);
    expect(
      requestSchema.properties.agentMentionSelections.items.properties
        .credentialId.type
    ).toBe("string");
    expect(
      requestSchema.properties.agentMentionSelections.description
    ).toContain("task-comment-agent-mention-invalid");

    const path =
      document.paths["/api/projects/{projectId}/tasks/{taskId}/comments"];
    expect(path.post.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TaskCommentCreateRequest"
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

  test("documents the epic archive and restore surface", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    expect(
      AGENT_API_ENDPOINTS.filter((endpoint) => endpoint.tag === "Epics").map(
        (endpoint) => `${endpoint.method} ${endpoint.path}`
      )
    ).toEqual([
      "GET /api/projects/{projectId}/epics",
      "POST /api/projects/{projectId}/epics",
      "PATCH /api/projects/{projectId}/epics/{epicId}",
      "DELETE /api/projects/{projectId}/epics/{epicId}",
      "POST /api/projects/{projectId}/epics/{epicId}/archive",
      "DELETE /api/projects/{projectId}/epics/{epicId}/archive",
    ]);

    expect(
      document.components.schemas.ProjectEpicRecord.required
    ).toContain("archivedAt");
    expect(
      document.components.schemas.ProjectEpicRecord.properties.archivedAt.type
    ).toEqual(["string", "null"]);

    const epicListGet = document.paths["/api/projects/{projectId}/epics"].get;
    const queryParameters = epicListGet.parameters.filter(
      (parameter: { in?: string }) => parameter.in === "query"
    );
    expect(queryParameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      "includeArchived",
    ]);

    const archivePath =
      document.paths["/api/projects/{projectId}/epics/{epicId}/archive"];
    expect(
      archivePath.post.responses[200].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/ProjectEpicArchiveResponse");
    expect(
      archivePath.delete.responses[200].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/ProjectEpicArchiveResponse");
  });

  test("documents epic linked-task reference contract", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    const linkedTasks =
      document.components.schemas.ProjectEpicRecord.properties.linkedTasks;
    expect(linkedTasks.items.$ref).toBe(
      "#/components/schemas/EpicLinkedTaskSummary"
    );

    const linkedTaskSchema = document.components.schemas.EpicLinkedTaskSummary;
    expect(linkedTaskSchema.required).toEqual([
      "id",
      "referenceNumber",
      "title",
      "status",
      "archivedAt",
    ]);
    expect(linkedTaskSchema.properties.referenceNumber).toMatchObject({
      type: "integer",
      minimum: 1,
    });
    expect(linkedTaskSchema.properties.status.enum).toEqual(TASK_STATUSES);
  });

  test("documents the self-scoped attention endpoints", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");

    expect(
      AGENT_API_ENDPOINTS.filter((endpoint) => endpoint.tag === "Attention").map(
        (endpoint) => `${endpoint.method} ${endpoint.path}`
      )
    ).toEqual([
      "GET /api/projects/{projectId}/agent-attention/mentions",
      "GET /api/projects/{projectId}/agent-attention/assignments",
    ]);
    expect(
      AGENT_API_ENDPOINTS.filter((endpoint) => endpoint.tag === "Attention").every(
        (endpoint) => endpoint.requiredScopes.join(",") === "attention:read"
      )
    ).toBe(true);
    expect(
      AGENT_API_ENDPOINTS.filter((endpoint) => endpoint.tag === "Attention").every(
        (endpoint) =>
          endpoint.notes?.some((note) =>
            note.includes("require task:read, so an attention:read-only credential gets 403")
          )
      )
    ).toBe(true);

    const mentionsPath =
      document.paths["/api/projects/{projectId}/agent-attention/mentions"].get;
    const assignmentsPath =
      document.paths["/api/projects/{projectId}/agent-attention/assignments"].get;

    const parameterNames = (path: { parameters: Array<{ name?: string }> }) =>
      path.parameters
        .map((parameter) => parameter.name)
        .filter((name): name is string => Boolean(name));
    expect(mentionsPath.parameters[0]).toEqual({
      $ref: "#/components/parameters/ProjectId",
    });
    expect(parameterNames(mentionsPath)).toEqual([
      "eventType",
      "artifactType",
      "since",
      "until",
      "limit",
      "order",
      "cursor",
    ]);
    expect(parameterNames(assignmentsPath)).toEqual([
      "eventType",
      "artifactType",
      "state",
      "since",
      "until",
      "limit",
      "order",
      "cursor",
    ]);

    const limitParameter = mentionsPath.parameters.find(
      (parameter: { name?: string }) => parameter.name === "limit"
    ) as unknown as {
      schema: { minimum: number; maximum: number; default: number };
    };
    expect(limitParameter.schema).toMatchObject({
      minimum: 1,
      maximum: AGENT_ATTENTION_MAX_LIMIT,
      default: AGENT_ATTENTION_DEFAULT_LIMIT,
    });
    const orderParameter = mentionsPath.parameters.find(
      (parameter: { name?: string }) => parameter.name === "order"
    ) as unknown as { schema: { enum: string[] } };
    expect(orderParameter.schema.enum).toEqual([...AGENT_ATTENTION_ORDERS]);

    expect(
      document.paths["/api/projects/{projectId}/agent-attention/mentions"].get.responses[200]
        .content["application/json"].schema.$ref
    ).toBe("#/components/schemas/AgentAttentionMentionListResponse");
    expect(
      document.paths["/api/projects/{projectId}/agent-attention/assignments"].get.responses[200]
        .content["application/json"].schema.$ref
    ).toBe("#/components/schemas/AgentAttentionAssignmentListResponse");
    expect(
      document.paths["/api/projects/{projectId}/agent-attention/mentions"].get.responses[200]
        .content["application/json"].examples.commentMention.value.items[0].eventType
    ).toBe("mention");
    expect(
      Object.keys(
        document.paths["/api/projects/{projectId}/agent-attention/assignments"].get.responses[200]
          .content["application/json"].examples
      )
    ).toEqual(["taskAssignment", "meetingTodoAssignment"]);
  });

  test("publishes the attention item and envelope schemas", () => {
    const document = buildAgentOpenApiDocument("https://preview.nexusdash.test");
    const schemas = document.components.schemas;

    expect(schemas.AgentAttentionMentionListResponse.required).toEqual([
      "projectId",
      "filters",
      "items",
      "nextCursor",
    ]);
    expect(
      schemas.AgentAttentionMentionListResponse.properties.items.items.$ref
    ).toBe("#/components/schemas/AgentAttentionMentionItem");
    expect(
      schemas.AgentAttentionAssignmentListResponse.properties.items.items.$ref
    ).toBe("#/components/schemas/AgentAttentionAssignmentItem");
    expect(
      schemas.AgentAttentionMentionListResponse.properties.filters.$ref
    ).toBe("#/components/schemas/AgentAttentionFilterEnvelope");

    const filterEnvelope = schemas.AgentAttentionFilterEnvelope;
    expect(filterEnvelope.required).toEqual([
      "eventType",
      "artifactType",
      "state",
      "since",
      "until",
      "limit",
      "order",
      "cursor",
    ]);
    expect(filterEnvelope.properties.order.enum).toEqual([
      ...AGENT_ATTENTION_ORDERS,
    ]);
    expect(filterEnvelope.properties.limit.maximum).toBe(AGENT_ATTENTION_MAX_LIMIT);

    expect(schemas.AgentAttentionMentionItem.required).toEqual([
      "id",
      "eventType",
      "projectId",
      "occurredAt",
      "artifact",
      "summary",
      "actor",
      "currentState",
    ]);
    expect(schemas.AgentAttentionMentionItem.properties.eventType.enum).toEqual([
      "mention",
    ]);
    expect(
      schemas.AgentAttentionMentionItem.properties.artifact.$ref
    ).toBe("#/components/schemas/AgentAttentionMentionArtifact");
    expect(
      schemas.AgentAttentionMentionItem.properties.actor.$ref
    ).toBe("#/components/schemas/AgentAttentionActor");

    const assignmentItem = schemas.AgentAttentionAssignmentItem;
    expect(assignmentItem.properties.eventType.enum).toEqual(["assignment"]);
    expect(
      assignmentItem.properties.artifact.oneOf.map(
        (entry: { $ref: string }) => entry.$ref
      )
    ).toEqual([
      "#/components/schemas/AgentAttentionTaskArtifact",
      "#/components/schemas/AgentAttentionMeetingTodoArtifact",
    ]);
    expect(
      assignmentItem.properties.currentState.$ref
    ).toBe("#/components/schemas/AgentAttentionAssignmentCurrentState");
    expect(
      schemas.AgentAttentionAssignmentCurrentState.properties.assignmentState.enum
    ).toEqual([...AGENT_ATTENTION_ASSIGNMENT_STATES]);
    expect(
      schemas.AgentAttentionAssignmentCurrentState.properties.status.enum
    ).toEqual([...TASK_STATUSES, "open", "completed"]);

    expect(schemas.AgentAttentionActor.required).toEqual([
      "kind",
      "id",
      "displayName",
      "usernameTag",
    ]);
    expect(schemas.AgentAttentionActor.properties.kind.enum).toEqual([
      "human",
      "agent",
    ]);
  });

  test("attention example covers incremental polling, source references, and revocation", () => {
    const example = buildAgentAttentionExample();

    expect(example).toContain("/agent-attention/mentions?order=asc&limit=100");
    expect(example).toContain("since=$LAST_SEEN_OCCURRED_AT");
    expect(example).toContain("cursor=$NEXT_CURSOR");
    expect(example).toContain("order it was issued for");
    expect(example).toContain("/agent-attention/assignments?state=active");
    expect(example).toContain("currentState");
    expect(example).toContain("task:read");
    expect(example).toContain("revoked, expired, or rotated away");
    expect(example).not.toContain("nda_");
  });
});
