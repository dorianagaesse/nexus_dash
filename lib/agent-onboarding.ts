import { AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import { TASK_STATUSES } from "@/lib/task-status";

export const AGENT_API_VERSION = "v1";
export const AGENT_DOCS_PATH = `/docs/agent/${AGENT_API_VERSION}`;
export const AGENT_OPENAPI_PATH = `/api/docs/agent/${AGENT_API_VERSION}/openapi.json`;
export const AGENT_BASE_URL_PLACEHOLDER = "https://your-nexusdash-url";
export const AGENT_PROJECT_ID_PLACEHOLDER = "project_123";
export const AGENT_API_KEY_PLACEHOLDER = "nda_public.secret";
export const AGENT_BEARER_TOKEN_ENV_NAME = "NEXUSDASH_AGENT_BEARER_TOKEN";

type AgentApiTag = "Auth" | "Projects" | "Tasks" | "Context";
type AgentHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type AgentRequestContentType = "application/json" | "multipart/form-data";

export interface AgentApiEndpointDefinition {
  tag: AgentApiTag;
  method: AgentHttpMethod;
  path: string;
  title: string;
  description: string;
  requiredScopes: AgentScope[];
  requestContentType?: AgentRequestContentType;
  notes?: readonly string[];
}

export const AGENT_API_ENDPOINTS: ReadonlyArray<AgentApiEndpointDefinition> = [
  {
    tag: "Auth",
    method: "POST",
    path: "/api/auth/agent/token",
    title: "Exchange API key for bearer token",
    description:
      "Exchange a project-scoped agent API key for a short-lived bearer token.",
    requiredScopes: [],
    requestContentType: "application/json",
    notes: [
      "Also accepts Authorization: ApiKey <key> or x-agent-api-key headers.",
      "Returned bearer tokens are short-lived and project-scoped.",
    ],
  },
  {
    tag: "Projects",
    method: "GET",
    path: "/api/projects/{projectId}",
    title: "Read project summary",
    description: "Read project metadata and dashboard summary metrics.",
    requiredScopes: ["project:read"],
  },
  {
    tag: "Tasks",
    method: "GET",
    path: "/api/projects/{projectId}/tasks",
    title: "List tasks",
    description: "List project tasks visible to the scoped credential.",
    requiredScopes: ["task:read"],
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks",
    title: "Create task",
    description: "Create a new task inside the project.",
    requiredScopes: ["task:write"],
    requestContentType: "multipart/form-data",
    notes: [
      "Provide labels, relatedTaskIds, and attachmentLinks as JSON-encoded strings.",
      "Agent callers cannot upload file attachments in v1.",
    ],
  },
  {
    tag: "Tasks",
    method: "PATCH",
    path: "/api/projects/{projectId}/tasks/{taskId}",
    title: "Update task",
    description: "Update task metadata, rich text content, labels, and relations.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/reorder",
    title: "Reorder tasks",
    description: "Persist task ordering across board columns.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/{taskId}/archive",
    title: "Archive task",
    description: "Archive a completed task.",
    requiredScopes: ["task:write"],
    notes: ["Only tasks in the Done column can be archived."],
  },
  {
    tag: "Tasks",
    method: "DELETE",
    path: "/api/projects/{projectId}/tasks/{taskId}/archive",
    title: "Unarchive task",
    description: "Restore an archived completed task.",
    requiredScopes: ["task:write"],
    notes: ["Only tasks in the Done column can be unarchived."],
  },
  {
    tag: "Tasks",
    method: "DELETE",
    path: "/api/projects/{projectId}/tasks/{taskId}",
    title: "Delete task",
    description: "Delete a task from the project.",
    requiredScopes: ["task:delete"],
    notes: [
      "Delete scope does not imply read or write.",
      "Owner-level project role is still required at runtime.",
    ],
  },
  {
    tag: "Context",
    method: "GET",
    path: "/api/projects/{projectId}/context-cards",
    title: "List context cards",
    description: "List project context cards.",
    requiredScopes: ["context:read"],
  },
  {
    tag: "Context",
    method: "POST",
    path: "/api/projects/{projectId}/context-cards",
    title: "Create context card",
    description: "Create a context card with rich content and links.",
    requiredScopes: ["context:write"],
    requestContentType: "multipart/form-data",
    notes: [
      "Agent callers cannot upload file attachments in v1.",
      `Color must be one of: ${CONTEXT_CARD_COLORS.join(", ")}.`,
    ],
  },
  {
    tag: "Context",
    method: "PATCH",
    path: "/api/projects/{projectId}/context-cards/{cardId}",
    title: "Update context card",
    description: "Update an existing context card.",
    requiredScopes: ["context:write"],
    requestContentType: "multipart/form-data",
    notes: [`Color must be one of: ${CONTEXT_CARD_COLORS.join(", ")}.`],
  },
  {
    tag: "Context",
    method: "DELETE",
    path: "/api/projects/{projectId}/context-cards/{cardId}",
    title: "Delete context card",
    description: "Delete a context card from the project.",
    requiredScopes: ["context:delete"],
    notes: [
      "Delete scope does not imply read or write.",
      "Owner-level project role is still required at runtime.",
    ],
  },
] as const;

function normalizeOrigin(value: string | null | undefined): string {
  if (!value) {
    return AGENT_BASE_URL_PLACEHOLDER;
  }

  try {
    return new URL(value).origin;
  } catch {
    return AGENT_BASE_URL_PLACEHOLDER;
  }
}

export function buildAgentAbsoluteUrl(
  appOrigin: string | null | undefined,
  path: string
): string {
  return new URL(path, normalizeOrigin(appOrigin)).toString();
}

export function buildAgentDocumentationUrls(appOrigin?: string | null) {
  return {
    docsUrl: buildAgentAbsoluteUrl(appOrigin, AGENT_DOCS_PATH),
    openApiUrl: buildAgentAbsoluteUrl(appOrigin, AGENT_OPENAPI_PATH),
  };
}

export function buildAgentProjectEnvBlock(input: {
  appOrigin?: string | null;
  projectId?: string | null;
  apiKey?: string | null;
}): string {
  const projectId =
    typeof input.projectId === "string" && input.projectId.trim().length > 0
      ? input.projectId.trim()
      : AGENT_PROJECT_ID_PLACEHOLDER;
  const apiKey =
    typeof input.apiKey === "string" && input.apiKey.trim().length > 0
      ? input.apiKey.trim()
      : "<paste-the-one-time-api-key>";
  const baseUrl = normalizeOrigin(input.appOrigin);
  const { docsUrl, openApiUrl } = buildAgentDocumentationUrls(baseUrl);

  return [
    `NEXUSDASH_BASE_URL=${baseUrl}`,
    `NEXUSDASH_PROJECT_ID=${projectId}`,
    `NEXUSDASH_API_KEY=${apiKey}`,
    "NEXUSDASH_AGENT_TOKEN_PATH=/api/auth/agent/token",
    `${AGENT_BEARER_TOKEN_ENV_NAME}=<exchange-at-runtime>`,
    `NEXUSDASH_AGENT_DOCS_URL=${docsUrl}`,
    `NEXUSDASH_AGENT_OPENAPI_URL=${openApiUrl}`,
  ].join("\n");
}

export function buildAgentTokenExchangeExample(appOrigin?: string | null): string {
  const baseUrl = normalizeOrigin(appOrigin);
  return [
    'curl -X POST "$NEXUSDASH_BASE_URL/api/auth/agent/token" \\',
    '  -H "Authorization: ApiKey $NEXUSDASH_API_KEY"',
    "",
    "# response",
    "{",
    '  "accessToken": "<short-lived-bearer-token>",',
    '  "tokenType": "Bearer",',
    '  "expiresAt": "2026-04-01T08:10:00.000Z",',
    '  "expiresInSeconds": 600,',
    `  "projectId": "${AGENT_PROJECT_ID_PLACEHOLDER}",`,
    '  "scopes": ["project:read", "task:write"]',
    "}",
    "",
    `# Base URL example: ${baseUrl}`,
  ].join("\n");
}

export function buildAgentProjectReadExample(): string {
  return [
    'curl "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
  ].join("\n");
}

export function buildAgentTaskCreateExample(): string {
  return [
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -F "title=Draft release notes" \\',
    '  -F "description=<p>Summarize this week\\u0027s changes.</p>" \\',
    '  -F "labels=[\\"release\\",\\"docs\\"]" \\',
    '  -F "attachmentLinks=[\\"https://example.com/spec\\"]"',
  ].join("\n");
}

export function buildAgentContextCreateExample(): string {
  return [
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/context-cards" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -F "title=Operating assumptions" \\',
    '  -F "content=<p>Preview deploys happen from the feature branch.</p>" \\',
    `  -F "color=${CONTEXT_CARD_COLORS[0]}"`,
  ].join("\n");
}

function buildEndpointDescription(endpoint: AgentApiEndpointDefinition): string {
  if (!endpoint.notes || endpoint.notes.length === 0) {
    return endpoint.description;
  }

  return `${endpoint.description}\n\n${endpoint.notes.map((note) => `- ${note}`).join("\n")}`;
}

function buildSecurityScopesDescription(scopes: readonly AgentScope[]): string {
  if (scopes.length === 0) {
    return "No route-specific scope is required before token issuance.";
  }

  return `Required scopes: ${scopes.join(", ")}.`;
}

function buildCommonErrorResponses() {
  return {
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorResponse",
          },
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorResponse",
          },
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorResponse",
          },
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorResponse",
          },
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorResponse",
          },
        },
      },
    },
  };
}

export function buildAgentOpenApiDocument(appOrigin?: string | null) {
  const serverUrl = normalizeOrigin(appOrigin);
  const commonErrorResponses = buildCommonErrorResponses();

  return {
    openapi: "3.1.0",
    info: {
      title: "NexusDash Agent API",
      version: AGENT_API_VERSION,
      summary: "Stable project-scoped API surface for external agents.",
      description:
        "This contract documents the stable v1 routes intended for non-human agent callers. All routes remain project-scoped and require either an exchanged bearer token or an API key exchange step.",
    },
    servers: [
      {
        url: serverUrl,
        description: "Current NexusDash deployment",
      },
    ],
    tags: [
      {
        name: "Auth",
        description: "Exchange project-scoped API keys for short-lived bearer tokens.",
      },
      {
        name: "Projects",
        description: "Read project metadata and summary metrics.",
      },
      {
        name: "Tasks",
        description: "Create, read, update, reorder, archive, and delete project tasks.",
      },
      {
        name: "Context",
        description: "Create, read, update, and delete project context cards.",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Short-lived bearer token returned by POST /api/auth/agent/token.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "string",
            },
          },
        },
        TokenExchangeRequest: {
          type: "object",
          required: ["apiKey"],
          properties: {
            apiKey: {
              type: "string",
              example: AGENT_API_KEY_PLACEHOLDER,
            },
          },
        },
        TokenExchangeResponse: {
          type: "object",
          required: [
            "accessToken",
            "tokenType",
            "expiresAt",
            "expiresInSeconds",
            "projectId",
            "scopes",
          ],
          properties: {
            accessToken: {
              type: "string",
            },
            tokenType: {
              type: "string",
              enum: ["Bearer"],
            },
            expiresAt: {
              type: "string",
              format: "date-time",
            },
            expiresInSeconds: {
              type: "integer",
              example: 600,
            },
            projectId: {
              type: "string",
              example: AGENT_PROJECT_ID_PLACEHOLDER,
            },
            scopes: {
              type: "array",
              items: {
                type: "string",
                enum: AGENT_SCOPE_DEFINITIONS.map((definition) => definition.scope),
              },
            },
          },
        },
        ProjectSummary: {
          type: "object",
          required: ["id", "name", "description", "stats"],
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            description: {
              type: ["string", "null"],
            },
            stats: {
              type: "object",
              required: ["trackedTasks", "openTasks", "completedTasks", "contextCards"],
              properties: {
                trackedTasks: {
                  type: "integer",
                },
                openTasks: {
                  type: "integer",
                },
                completedTasks: {
                  type: "integer",
                },
                contextCards: {
                  type: "integer",
                },
              },
            },
          },
        },
        ProjectSummaryResponse: {
          type: "object",
          required: ["project"],
          properties: {
            project: {
              $ref: "#/components/schemas/ProjectSummary",
            },
          },
        },
        RelatedTaskSummary: {
          type: "object",
          required: ["id", "title", "status", "archivedAt"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: {
              type: "string",
              enum: TASK_STATUSES,
            },
            archivedAt: {
              type: ["string", "null"],
              format: "date-time",
            },
          },
        },
        TaskBlockedFollowUp: {
          type: "object",
          required: ["id", "content", "createdAt"],
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        TaskRecord: {
          type: "object",
          required: [
            "id",
            "title",
            "description",
            "blockedNote",
            "completedAt",
            "archivedAt",
            "status",
            "position",
            "label",
            "labelsJson",
            "createdAt",
            "updatedAt",
            "relatedTasks",
            "blockedFollowUps",
          ],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            blockedNote: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"], format: "date-time" },
            archivedAt: { type: ["string", "null"], format: "date-time" },
            status: {
              type: "string",
              enum: TASK_STATUSES,
            },
            position: { type: "integer" },
            label: { type: ["string", "null"] },
            labelsJson: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            relatedTasks: {
              type: "array",
              items: {
                $ref: "#/components/schemas/RelatedTaskSummary",
              },
            },
            blockedFollowUps: {
              type: "array",
              items: {
                $ref: "#/components/schemas/TaskBlockedFollowUp",
              },
            },
          },
        },
        TaskListResponse: {
          type: "object",
          required: ["tasks"],
          properties: {
            tasks: {
              type: "array",
              items: {
                $ref: "#/components/schemas/TaskRecord",
              },
            },
          },
        },
        TaskCreateRequest: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            labels: {
              type: "string",
              description: "JSON-encoded string array.",
              example: '["release","docs"]',
            },
            relatedTaskIds: {
              type: "string",
              description: "JSON-encoded string array.",
              example: '["task_456"]',
            },
            attachmentLinks: {
              type: "string",
              description: "JSON-encoded string array of URLs.",
              example: '["https://example.com/spec"]',
            },
          },
        },
        TaskCreateResponse: {
          type: "object",
          required: ["taskId"],
          properties: {
            taskId: { type: "string" },
          },
        },
        TaskUpdateRequest: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            label: { type: "string" },
            labels: {
              type: "array",
              items: { type: "string" },
            },
            description: { type: "string" },
            blockedFollowUpEntry: { type: "string" },
            relatedTaskIds: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        TaskUpdateResponse: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "object",
              required: [
                "id",
                "title",
                "label",
                "labelsJson",
                "description",
                "blockedNote",
                "status",
                "position",
                "archivedAt",
                "relatedTasks",
                "blockedFollowUps",
              ],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                label: { type: ["string", "null"] },
                labelsJson: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                blockedNote: { type: ["string", "null"] },
                status: {
                  type: "string",
                  enum: TASK_STATUSES,
                },
                position: { type: "integer" },
                archivedAt: { type: ["string", "null"], format: "date-time" },
                relatedTasks: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/RelatedTaskSummary",
                  },
                },
                blockedFollowUps: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/TaskBlockedFollowUp",
                  },
                },
              },
            },
          },
        },
        TaskReorderRequest: {
          type: "object",
          required: ["columns"],
          properties: {
            columns: {
              type: "array",
              items: {
                type: "object",
                required: ["status", "taskIds"],
                properties: {
                  status: {
                    type: "string",
                    enum: TASK_STATUSES,
                  },
                  taskIds: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
        OkResponse: {
          type: "object",
          required: ["ok"],
          properties: {
            ok: {
              type: "boolean",
              enum: [true],
            },
          },
        },
        ArchiveTaskResponse: {
          type: "object",
          required: ["ok", "archivedAt"],
          properties: {
            ok: {
              type: "boolean",
              enum: [true],
            },
            archivedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        ContextCardListItem: {
          type: "object",
          required: ["id", "title", "content", "color", "createdAt"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            color: {
              type: "string",
              enum: CONTEXT_CARD_COLORS,
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ContextAttachment: {
          type: "object",
          required: ["id", "kind", "name", "url", "mimeType", "sizeBytes"],
          properties: {
            id: { type: "string" },
            kind: { type: "string" },
            name: { type: "string" },
            url: { type: ["string", "null"] },
            mimeType: { type: ["string", "null"] },
            sizeBytes: { type: ["integer", "null"] },
          },
        },
        ContextCardDetail: {
          type: "object",
          required: ["id", "title", "content", "color", "attachments"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            color: {
              type: "string",
              enum: CONTEXT_CARD_COLORS,
            },
            attachments: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ContextAttachment",
              },
            },
          },
        },
        ContextCardListResponse: {
          type: "object",
          required: ["cards"],
          properties: {
            cards: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ContextCardListItem",
              },
            },
          },
        },
        ContextCardCreateRequest: {
          type: "object",
          required: ["title", "content", "color"],
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            color: {
              type: "string",
              enum: CONTEXT_CARD_COLORS,
            },
            attachmentLinks: {
              type: "string",
              description: "JSON-encoded string array of URLs.",
              example: '["https://example.com/context"]',
            },
          },
        },
        ContextCardCreateResponse: {
          type: "object",
          required: ["cardId", "card"],
          properties: {
            cardId: { type: "string" },
            card: {
              $ref: "#/components/schemas/ContextCardDetail",
            },
          },
        },
        ContextCardUpdateRequest: {
          type: "object",
          required: ["title", "content", "color"],
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            color: {
              type: "string",
              enum: CONTEXT_CARD_COLORS,
            },
          },
        },
      },
      parameters: {
        ProjectId: {
          name: "projectId",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
        TaskId: {
          name: "taskId",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
        CardId: {
          name: "cardId",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      },
    },
    paths: {
      "/api/auth/agent/token": {
        post: {
          tags: ["Auth"],
          summary: AGENT_API_ENDPOINTS[0]?.title,
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[0]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[0]!.requiredScopes)}`,
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TokenExchangeRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Bearer token issued",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/TokenExchangeResponse",
                  },
                },
              },
            },
            400: commonErrorResponses[400],
            401: commonErrorResponses[401],
          },
        },
      },
      "/api/projects/{projectId}": {
        get: {
          tags: ["Projects"],
          security: [{ BearerAuth: [] }],
          summary: "Read project summary",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[1]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[1]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          responses: {
            200: {
              description: "Project summary returned",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ProjectSummaryResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks": {
        get: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "List tasks",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[2]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[2]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          responses: {
            200: {
              description: "Task list returned",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/TaskListResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        post: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Create task",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[3]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[3]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/TaskCreateRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Task created",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/TaskCreateResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks/{taskId}": {
        patch: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Update task",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[4]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[4]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TaskUpdateRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Task updated",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/TaskUpdateResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        delete: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Delete task",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[8]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[8]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          responses: {
            200: {
              description: "Task deleted",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/OkResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks/reorder": {
        post: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Reorder tasks",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[5]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[5]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TaskReorderRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Task ordering persisted",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/OkResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks/{taskId}/archive": {
        post: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Archive task",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[6]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[6]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          responses: {
            200: {
              description: "Task archived",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ArchiveTaskResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        delete: {
          tags: ["Tasks"],
          security: [{ BearerAuth: [] }],
          summary: "Unarchive task",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[7]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[7]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          responses: {
            200: {
              description: "Task unarchived",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/OkResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/context-cards": {
        get: {
          tags: ["Context"],
          security: [{ BearerAuth: [] }],
          summary: "List context cards",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[9]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[9]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          responses: {
            200: {
              description: "Context cards returned",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ContextCardListResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        post: {
          tags: ["Context"],
          security: [{ BearerAuth: [] }],
          summary: "Create context card",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[10]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[10]!.requiredScopes)}`,
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/ContextCardCreateRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Context card created",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ContextCardCreateResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/context-cards/{cardId}": {
        patch: {
          tags: ["Context"],
          security: [{ BearerAuth: [] }],
          summary: "Update context card",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[11]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[11]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/ContextCardUpdateRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Context card updated",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/OkResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        delete: {
          tags: ["Context"],
          security: [{ BearerAuth: [] }],
          summary: "Delete context card",
          description: `${buildEndpointDescription(AGENT_API_ENDPOINTS[12]!)}\n\n${buildSecurityScopesDescription(AGENT_API_ENDPOINTS[12]!.requiredScopes)}`,
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          responses: {
            200: {
              description: "Context card deleted",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/OkResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
    },
  } as const;
}
