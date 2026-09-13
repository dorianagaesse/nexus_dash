import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AGENT_ATTENTION_DEFAULT_LIMIT,
  AGENT_ATTENTION_MAX_LIMIT,
} from "@/lib/agent-attention";
import { AGENT_PROJECT_ID_PLACEHOLDER } from "@/lib/agent-onboarding";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const attentionServiceMock = vi.hoisted(() => ({
  listAgentMentionEvents: vi.fn(),
  listAgentAssignments: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

// Keep the real response mappers (Date -> ISO conversions) so the contract
// test exercises the same serialization the routes use in production.
vi.mock("@/lib/services/project-agent-attention-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/services/project-agent-attention-service")
    >();
  return {
    ...original,
    listAgentMentionEvents: attentionServiceMock.listAgentMentionEvents,
    listAgentAssignments: attentionServiceMock.listAgentAssignments,
  };
});

import { GET as getMentionEvents } from "@/app/api/projects/[projectId]/agent-attention/mentions/route";
import { GET as getAssignments } from "@/app/api/projects/[projectId]/agent-attention/assignments/route";
import { buildAgentOpenApiDocument } from "@/lib/agent-onboarding";

type JsonSchema = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;

const MENTION_PATH = "/api/projects/{projectId}/agent-attention/mentions";
const ASSIGNMENT_PATH = "/api/projects/{projectId}/agent-attention/assignments";

const AGENT_ACCESS = {
  credentialId: "credential-1",
  projectId: "p1",
  scopes: ["attention:read"],
};

function asRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}

function resolveRef(document: JsonRecord, ref: string): JsonSchema {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }

  let current: unknown = document;
  for (const segment of ref.slice(2).split("/")) {
    current = asRecord(current)[segment];
    if (current === undefined) {
      throw new Error(`Unresolvable $ref: ${ref}`);
    }
  }

  return current as JsonSchema;
}

function matchesJsonType(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function collectSchemaErrors(
  schema: JsonSchema,
  value: unknown,
  document: JsonRecord,
  path: string
): string[] {
  if (typeof schema.$ref === "string") {
    return collectSchemaErrors(resolveRef(document, schema.$ref), value, document, path);
  }

  if (Array.isArray(schema.oneOf)) {
    const branchResults = (schema.oneOf as JsonSchema[]).map((branch) =>
      collectSchemaErrors(branch, value, document, path)
    );
    const matchingBranches = branchResults.filter(
      (branchErrors) => branchErrors.length === 0
    );
    if (matchingBranches.length !== 1) {
      return [
        `${path}: expected exactly one oneOf branch to match, matched ${matchingBranches.length}`,
      ];
    }
    return [];
  }

  const errors: string[] = [];

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type)
      ? (schema.type as string[])
      : [schema.type as string];
    if (!allowedTypes.some((type) => matchesJsonType(type, value))) {
      errors.push(`${path}: expected type ${allowedTypes.join("|")}`);
      return errors;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => entry === value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} is not in enum`);
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: ${value} is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: ${value} is above maximum ${schema.maximum}`);
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord;

    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in record)) {
          errors.push(`${path}: missing required property "${key}"`);
        }
      }
    }

    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in record) {
        errors.push(
          ...collectSchemaErrors(propertySchema, record[key], document, `${path}.${key}`)
        );
      }
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    value.forEach((entry, index) => {
      errors.push(
        ...collectSchemaErrors(schema.items as JsonSchema, entry, document, `${path}[${index}]`)
      );
    });
  }

  return errors;
}

function documentResponseSchema(
  document: JsonRecord,
  path: string,
  method: string,
  status: string
): JsonSchema {
  const operation = asRecord(asRecord(asRecord(document.paths)[path])[method]);
  const response = asRecord(asRecord(operation.responses)[status]);
  return asRecord(asRecord(asRecord(response.content)["application/json"]).schema);
}

function documentExamples(
  document: JsonRecord,
  path: string,
  method: string
): Array<{ name: string; value: JsonRecord }> {
  const operation = asRecord(asRecord(asRecord(document.paths)[path])[method]);
  const response = asRecord(asRecord(operation.responses)["200"]);
  const examples = asRecord(asRecord(asRecord(response.content)["application/json"]).examples);
  return Object.entries(examples).map(([name, example]) => ({
    name,
    value: asRecord(asRecord(example).value),
  }));
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

const MENTION_ITEMS = [
  {
    id: "mention:row-1",
    eventType: "mention" as const,
    projectId: "p1",
    occurredAt: new Date("2026-09-12T10:00:00.000Z"),
    artifact: {
      type: "task_comment" as const,
      id: "comment-1",
      taskId: "task-1",
      taskTitle: "Release task",
    },
    summary: "owner mentioned Release bot (agent) in a comment on \"Release task\"",
    actor: {
      kind: "human" as const,
      id: "user-1",
      displayName: "owner",
      usernameTag: "owner#0007",
    },
    currentState: { status: "In Progress", archivedAt: null as Date | null },
  },
  {
    id: "mention:row-2",
    eventType: "mention" as const,
    projectId: "p1",
    occurredAt: new Date("2026-09-10T08:00:00.000Z"),
    artifact: {
      type: "task_comment" as const,
      id: "comment-2",
      taskId: "task-2",
      taskTitle: "Archived follow-up",
    },
    summary: "reviewer mentioned Release bot (agent) in a comment",
    actor: {
      kind: "agent" as const,
      id: "credential-2",
      displayName: "Release bot (agent)",
      usernameTag: null,
    },
    currentState: { status: "Done", archivedAt: new Date("2026-09-11T00:00:00.000Z") },
  },
];

const ASSIGNMENT_ITEMS = [
  {
    id: "assignment:task:task-2",
    eventType: "assignment" as const,
    projectId: "p1",
    occurredAt: new Date("2026-09-12T11:30:00.000Z"),
    artifact: { type: "task" as const, id: "task-2", title: "Draft launch notes" },
    summary: "owner assigned Release bot (agent) to task \"Draft launch notes\"",
    actor: {
      kind: "human" as const,
      id: "user-1",
      displayName: "owner",
      usernameTag: "owner#0007",
    },
    currentState: {
      assignmentState: "active" as const,
      status: "Backlog",
      archivedAt: null as Date | null,
    },
  },
  {
    id: "assignment:meeting_todo:todo-1",
    eventType: "assignment" as const,
    projectId: "p1",
    occurredAt: null as Date | null,
    artifact: {
      type: "meeting_todo" as const,
      id: "todo-1",
      content: "Send the recap to stakeholders",
      meetingNoteId: "note-1",
      meetingNoteTitle: "Weekly sync",
    },
    summary: "owner assigned Release bot (agent) to a meeting to-do",
    actor: null,
    currentState: {
      assignmentState: "completed" as const,
      status: "completed",
      archivedAt: null as Date | null,
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiGuardMock.requireApiPrincipal.mockResolvedValue({
    ok: true,
    principal: {
      kind: "agent",
      actorUserId: "owner-1",
      requestId: "request-agent-1",
    },
  });
  apiGuardMock.getAgentProjectAccessContext.mockReturnValue(AGENT_ACCESS);
  attentionServiceMock.listAgentMentionEvents.mockResolvedValue({
    ok: true,
    data: { items: [], nextCursor: null },
  });
  attentionServiceMock.listAgentAssignments.mockResolvedValue({
    ok: true,
    data: { items: [], nextCursor: null },
  });
});

describe("agent attention runtime/schema contract", () => {
  test("mention responses validate against the published schema", async () => {
    attentionServiceMock.listAgentMentionEvents.mockResolvedValueOnce({
      ok: true,
      data: { items: MENTION_ITEMS, nextCursor: "next-cursor-token" },
    });

    const response = await getMentionEvents(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/mentions?since=2026-09-01T00:00:00.000Z&limit=5&order=asc"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    const body = await readJson(response);

    const document = buildAgentOpenApiDocument(
      "https://preview.nexusdash.test"
    ) as unknown as JsonRecord;
    const schema = documentResponseSchema(document, MENTION_PATH, "get", "200");
    expect(collectSchemaErrors(schema, body, document, "$")).toEqual([]);

    const items = body.items as JsonRecord[];
    expect(items[0].occurredAt).toBe("2026-09-12T10:00:00.000Z");
    expect(items[1].currentState).toEqual({
      status: "Done",
      archivedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(items[1].actor).toEqual({
      kind: "agent",
      id: "credential-2",
      displayName: "Release bot (agent)",
      usernameTag: null,
    });
    expect(body.filters).toEqual({
      eventType: null,
      artifactType: null,
      state: null,
      since: "2026-09-01T00:00:00.000Z",
      until: null,
      limit: 5,
      order: "asc",
      cursor: null,
    });
    expect(body.nextCursor).toBe("next-cursor-token");
  });

  test("assignment responses validate against the published schema", async () => {
    attentionServiceMock.listAgentAssignments.mockResolvedValueOnce({
      ok: true,
      data: { items: ASSIGNMENT_ITEMS, nextCursor: null },
    });

    const response = await getAssignments(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/assignments?state=active"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    const body = await readJson(response);

    const document = buildAgentOpenApiDocument(
      "https://preview.nexusdash.test"
    ) as unknown as JsonRecord;
    const schema = documentResponseSchema(document, ASSIGNMENT_PATH, "get", "200");
    expect(collectSchemaErrors(schema, body, document, "$")).toEqual([]);

    const items = body.items as JsonRecord[];
    expect(items[0].occurredAt).toBe("2026-09-12T11:30:00.000Z");
    expect(items[1].occurredAt).toBeNull();
    expect(items[1].actor).toBeNull();
    expect(items[1].currentState).toEqual({
      assignmentState: "completed",
      status: "completed",
      archivedAt: null,
    });
    expect(body.filters).toMatchObject({ state: "active" });
  });

  test("runtime error bodies validate against the documented error schema", async () => {
    const document = buildAgentOpenApiDocument(
      "https://preview.nexusdash.test"
    ) as unknown as JsonRecord;

    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(undefined);
    const forbidden = await getMentionEvents(
      new NextRequest("http://localhost/api/projects/p1/agent-attention/mentions"),
      projectParams("p1")
    );
    expect(forbidden.status).toBe(403);
    const forbiddenBody = await readJson(forbidden);
    expect(
      collectSchemaErrors(
        documentResponseSchema(document, MENTION_PATH, "get", "403"),
        forbiddenBody,
        document,
        "$"
      )
    ).toEqual([]);

    const invalidFilter = await getAssignments(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/assignments?state=pending"
      ),
      projectParams("p1")
    );
    expect(invalidFilter.status).toBe(400);
    const invalidFilterBody = await readJson(invalidFilter);
    expect(invalidFilterBody).toEqual({ error: "agent-attention-invalid-filter" });
    expect(
      collectSchemaErrors(
        documentResponseSchema(document, ASSIGNMENT_PATH, "get", "400"),
        invalidFilterBody,
        document,
        "$"
      )
    ).toEqual([]);

    expect(attentionServiceMock.listAgentMentionEvents).not.toHaveBeenCalled();
    expect(attentionServiceMock.listAgentAssignments).not.toHaveBeenCalled();
  });

  test("published examples validate against their schemas and stay synthetic", () => {
    const document = buildAgentOpenApiDocument(
      "https://preview.nexusdash.test"
    ) as unknown as JsonRecord;

    const mentionExamples = documentExamples(document, MENTION_PATH, "get");
    expect(mentionExamples.map((example) => example.name)).toEqual(["commentMention"]);
    const mentionSchema = documentResponseSchema(document, MENTION_PATH, "get", "200");
    for (const example of mentionExamples) {
      expect(collectSchemaErrors(mentionSchema, example.value, document, "$")).toEqual([]);
      const items = example.value.items as JsonRecord[];
      expect((items[0].artifact as JsonRecord).type).toBe("task_comment");
    }

    const assignmentExamples = documentExamples(document, ASSIGNMENT_PATH, "get");
    expect(assignmentExamples.map((example) => example.name)).toEqual([
      "taskAssignment",
      "meetingTodoAssignment",
    ]);
    const assignmentSchema = documentResponseSchema(document, ASSIGNMENT_PATH, "get", "200");
    const coveredArtifactTypes = assignmentExamples.map((example) => {
      expect(collectSchemaErrors(assignmentSchema, example.value, document, "$")).toEqual([]);
      const items = example.value.items as JsonRecord[];
      return (items[0].artifact as JsonRecord).type;
    });
    expect(new Set(coveredArtifactTypes)).toEqual(new Set(["task", "meeting_todo"]));

    const serializedExamples = JSON.stringify([
      ...mentionExamples,
      ...assignmentExamples,
    ]);
    expect(serializedExamples).not.toMatch(/nda_[A-Za-z0-9._-]{6,}/);
    expect(serializedExamples).not.toMatch(/[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/);
    expect(serializedExamples).not.toMatch(/Bearer\s/);
    expect(serializedExamples).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(serializedExamples).not.toMatch(/https?:\/\//);

    for (const example of [...mentionExamples, ...assignmentExamples]) {
      expect(example.value.projectId).toBe(AGENT_PROJECT_ID_PLACEHOLDER);
      const items = example.value.items as JsonRecord[];
      for (const item of items) {
        expect(String(item.id)).toMatch(
          /^(mention:|assignment:task:|assignment:meeting_todo:)/
        );
      }
    }
  });

  test("published filter bounds match the runtime defaults", () => {
    const document = buildAgentOpenApiDocument(
      "https://preview.nexusdash.test"
    ) as unknown as JsonRecord;
    const operation = asRecord(asRecord(asRecord(document.paths)[MENTION_PATH]).get);
    const parameters = operation.parameters as JsonRecord[];
    const limitParameter = parameters.find(
      (parameter) => parameter.name === "limit"
    ) as JsonRecord;
    const limitSchema = limitParameter.schema as JsonRecord;

    expect(limitSchema.minimum).toBe(1);
    expect(limitSchema.maximum).toBe(AGENT_ATTENTION_MAX_LIMIT);
    expect(limitSchema.default).toBe(AGENT_ATTENTION_DEFAULT_LIMIT);
  });
});
