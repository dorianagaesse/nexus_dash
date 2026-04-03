import { AGENT_SCOPE_DEFINITIONS, type AgentScope } from "@/lib/agent-access";
import { CONTEXT_CARD_COLORS } from "@/lib/context-card-colors";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export const AGENT_API_VERSION = "v1";
export const AGENT_DOCS_PATH = `/docs/agent/${AGENT_API_VERSION}`;
export const AGENT_OPENAPI_PATH = `/api/docs/agent/${AGENT_API_VERSION}/openapi.json`;
export const AGENT_BASE_URL_PLACEHOLDER = "https://your-nexusdash-url";
export const AGENT_PROJECT_ID_PLACEHOLDER = "project_123";
export const AGENT_API_KEY_PLACEHOLDER = "nda_public.secret";
export const AGENT_BEARER_TOKEN_ENV_NAME = "NEXUSDASH_AGENT_BEARER_TOKEN";
export const AGENT_ATTACHMENT_MAX_FILE_SIZE_LABEL = "25MB";

type AgentApiTag = "Auth" | "Projects" | "Tasks" | "Context";
type AgentHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type AgentRequestContentType = "application/json" | "multipart/form-data";

const [
  AGENT_TASK_STATUS_BACKLOG,
  AGENT_TASK_STATUS_IN_PROGRESS,
  AGENT_TASK_STATUS_BLOCKED,
  AGENT_TASK_STATUS_DONE,
] = TASK_STATUSES;

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
      "Canonical pattern: send the API key in Authorization: ApiKey <key>.",
      "JSON body and x-agent-api-key remain supported as compatibility alternatives.",
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
    requestContentType: "application/json",
    notes: [
      "Canonical agent format is application/json; multipart/form-data remains supported for browser-oriented flows.",
      "Use attachmentLinks as an array of { name, url } objects.",
      "Use the direct-upload attachment routes for binary files and images.",
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
    description: "Persist task ordering across board columns and status lanes.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
    notes: [`Use this route to move a task between ${TASK_STATUSES.join(", ")}.`],
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/{taskId}/archive",
    title: "Archive task",
    description: "Archive a completed task.",
    requiredScopes: ["task:write"],
    notes: [
      `Move the task to ${AGENT_TASK_STATUS_DONE} with reorder first.`,
      `Only tasks in the ${AGENT_TASK_STATUS_DONE} column can be archived.`,
    ],
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
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/{taskId}/attachments/upload-url",
    title: "Create task attachment upload target",
    description: "Create a signed upload target for a task file attachment.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
    notes: [
      `Binary uploads are limited to ${AGENT_ATTACHMENT_MAX_FILE_SIZE_LABEL} per file.`,
      "After uploading bytes to storage, finalize the upload on the direct route.",
    ],
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/{taskId}/attachments/direct",
    title: "Finalize task attachment upload",
    description: "Attach a previously uploaded file to the task.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Tasks",
    method: "POST",
    path: "/api/projects/{projectId}/tasks/{taskId}/attachments/direct/cleanup",
    title: "Cleanup unfinished task upload",
    description: "Delete an uploaded file when the direct-upload flow is abandoned before finalize.",
    requiredScopes: ["task:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Tasks",
    method: "DELETE",
    path: "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}",
    title: "Delete task attachment",
    description: "Remove an existing task attachment.",
    requiredScopes: ["task:write"],
  },
  {
    tag: "Tasks",
    method: "GET",
    path: "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download",
    title: "Download task attachment",
    description: "Download a file attachment or follow a temporary signed redirect.",
    requiredScopes: ["task:read"],
    notes: ["Use the downloadUrl returned in task attachment metadata."],
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
    requestContentType: "application/json",
    notes: [
      "Canonical agent format is application/json; multipart/form-data remains supported for browser-oriented flows.",
      "Use attachmentLinks as an array of { name, url } objects.",
      "Use the direct-upload attachment routes for binary files and images.",
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
    requestContentType: "application/json",
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
  {
    tag: "Context",
    method: "POST",
    path: "/api/projects/{projectId}/context-cards/{cardId}/attachments/upload-url",
    title: "Create context attachment upload target",
    description: "Create a signed upload target for a context-card file attachment.",
    requiredScopes: ["context:write"],
    requestContentType: "application/json",
    notes: [
      `Binary uploads are limited to ${AGENT_ATTACHMENT_MAX_FILE_SIZE_LABEL} per file.`,
      "After uploading bytes to storage, finalize the upload on the direct route.",
    ],
  },
  {
    tag: "Context",
    method: "POST",
    path: "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct",
    title: "Finalize context attachment upload",
    description: "Attach a previously uploaded file to the context card.",
    requiredScopes: ["context:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Context",
    method: "POST",
    path: "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct/cleanup",
    title: "Cleanup unfinished context upload",
    description:
      "Delete an uploaded file when the context direct-upload flow is abandoned before finalize.",
    requiredScopes: ["context:write"],
    requestContentType: "application/json",
  },
  {
    tag: "Context",
    method: "DELETE",
    path: "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}",
    title: "Delete context attachment",
    description: "Remove an existing context-card attachment.",
    requiredScopes: ["context:write"],
  },
  {
    tag: "Context",
    method: "GET",
    path: "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}/download",
    title: "Download context attachment",
    description: "Download a file attachment or follow a temporary signed redirect.",
    requiredScopes: ["context:read"],
    notes: ["Use the downloadUrl returned in context-card attachment metadata."],
  },
] as const;

export const AGENT_LIMITATIONS: readonly string[] = [
  "Use application/json for agent write requests unless you are intentionally following a browser-oriented multipart flow.",
  "Binary files and images use the direct-upload attachment routes; non-file writes should not rely on multipart/form-data.",
  "attachmentLinks must be arrays of { name, url } objects. Plain string URL arrays are not the canonical v1 format.",
  "Task status changes happen through POST /api/projects/{projectId}/tasks/reorder, not PATCH /api/projects/{projectId}/tasks/{taskId}.",
  "Rich HTML is sanitized. Inline <img> content should not be treated as a supported image-delivery path; use attachments instead.",
  "Preview deployments may still be protected by Vercel. If a preview returns Vercel's auth wall, make the preview reachable or use an approved bypass before testing the agent flow.",
];

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
    "# Canonical token exchange: send the API key in the Authorization header",
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
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"title\":\"Draft release notes\",\"description\":\"<p>Summarize this week''s changes.</p>\",\"labels\":[\"release\",\"docs\"],\"attachmentLinks\":[{\"name\":\"Spec\",\"url\":\"https://example.com/spec\"}]}'",
  ].join("\n");
}

export function buildAgentContextCreateExample(): string {
  return [
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/context-cards" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '{"title":"Operating assumptions","content":"<p>Preview deploys happen from the feature branch.</p>","color":"${CONTEXT_CARD_COLORS[0]}"}'`,
  ].join("\n");
}

export function buildAgentTaskUpdateExample(): string {
  return [
    'curl -X PATCH "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"title":"Draft release notes","description":"<p>Add release highlights.</p>","labels":["release","ready"],"relatedTaskIds":["task_456"]}\'',
  ].join("\n");
}

function buildTaskReorderPayload(
  columns: ReadonlyArray<{
    status: TaskStatus;
    taskIds: readonly string[];
  }>
): string {
  return JSON.stringify({
    columns: columns.map((column) => ({
      status: column.status,
      taskIds: [...column.taskIds],
    })),
  });
}

export function buildAgentTaskReorderExample(): string {
  const payload = buildTaskReorderPayload([
    { status: AGENT_TASK_STATUS_BACKLOG, taskIds: [] },
    { status: AGENT_TASK_STATUS_IN_PROGRESS, taskIds: ["$TASK_ID"] },
    { status: AGENT_TASK_STATUS_BLOCKED, taskIds: [] },
    { status: AGENT_TASK_STATUS_DONE, taskIds: [] },
  ]);

  return [
    `# Valid statuses: ${TASK_STATUSES.join(", ")}`,
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/reorder" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${payload}'`,
  ].join("\n");
}

export function buildAgentTaskArchiveExample(): string {
  const payload = buildTaskReorderPayload([
    { status: AGENT_TASK_STATUS_BACKLOG, taskIds: [] },
    { status: AGENT_TASK_STATUS_IN_PROGRESS, taskIds: [] },
    { status: AGENT_TASK_STATUS_BLOCKED, taskIds: [] },
    { status: AGENT_TASK_STATUS_DONE, taskIds: ["$TASK_ID"] },
  ]);

  return [
    `# Archive only after the task is in ${AGENT_TASK_STATUS_DONE}`,
    `# First move the task into ${AGENT_TASK_STATUS_DONE}`,
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/reorder" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${payload}'`,
    "",
    "# Then archive it",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/archive" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
  ].join("\n");
}

export function buildAgentContextUpdateExample(): string {
  return [
    'curl -X PATCH "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/context-cards/$CARD_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '{"title":"Operating assumptions","content":"<p>Release previews deploy from the feature branch.</p>","color":"${CONTEXT_CARD_COLORS[1]}"}'`,
  ].join("\n");
}

export function buildAgentAttachmentUploadExample(): string {
  return [
    "# 1. Request a signed upload target",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/attachments/upload-url" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"name":"architecture.png","mimeType":"image/png","sizeBytes":204800}\'',
    "",
    "# 2. Upload the raw bytes to the returned uploadUrl using the returned headers",
    'curl -X PUT "$UPLOAD_URL" \\',
    '  -H "Content-Type: image/png" \\',
    '  --data-binary "@./architecture.png"',
    "",
    "# 3. Finalize the upload inside NexusDash",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/attachments/direct" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"storageKey":"<upload.storageKey>","name":"architecture.png","mimeType":"image/png","sizeBytes":204800}\'',
  ].join("\n");
}

export function buildAgentContextAttachmentUploadExample(): string {
  return [
    "# 1. Request a signed upload target",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/context-cards/$CARD_ID/attachments/upload-url" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"name":"reference-diagram.png","mimeType":"image/png","sizeBytes":204800}\'',
    "",
    "# 2. Upload the raw bytes to the returned uploadUrl using the returned headers",
    'curl -X PUT "$UPLOAD_URL" \\',
    '  -H "Content-Type: image/png" \\',
    '  --data-binary "@./reference-diagram.png"',
    "",
    "# 3. Finalize the upload inside NexusDash",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/context-cards/$CARD_ID/attachments/direct" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"storageKey":"<upload.storageKey>","name":"reference-diagram.png","mimeType":"image/png","sizeBytes":204800}\'',
  ].join("\n");
}

export function buildAgentSmokeTestExample(): string {
  const moveToDonePayload = buildTaskReorderPayload([
    { status: AGENT_TASK_STATUS_BACKLOG, taskIds: [] },
    { status: AGENT_TASK_STATUS_IN_PROGRESS, taskIds: [] },
    { status: AGENT_TASK_STATUS_BLOCKED, taskIds: [] },
    { status: AGENT_TASK_STATUS_DONE, taskIds: ["$TASK_ID"] },
  ]);

  return [
    "# Exchange the API key",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/auth/agent/token" \\',
    '  -H "Authorization: ApiKey $NEXUSDASH_API_KEY"',
    "",
    "# Read the project",
    'curl "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
    "",
    "# Create a task",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"title":"External smoke task","description":"<p>Created by smoke test.</p>"}\'',
    "",
    "# Update the task",
    'curl -X PATCH "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"title":"External smoke task","description":"<p>Updated by smoke test.</p>","labels":["smoke"]}\'',
    "",
    "# Request a signed upload target for a binary attachment",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/attachments/upload-url" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"name":"smoke-image.png","mimeType":"image/png","sizeBytes":204800}\'',
    "",
    "# Upload the file bytes to the returned uploadUrl",
    'curl -X PUT "$UPLOAD_URL" \\',
    '  -H "Content-Type: image/png" \\',
    '  --data-binary "@./smoke-image.png"',
    "",
    "# Finalize the uploaded attachment",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/attachments/direct" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"storageKey":"<upload.storageKey>","name":"smoke-image.png","mimeType":"image/png","sizeBytes":204800}\'',
    "",
    `# Move the task to ${AGENT_TASK_STATUS_DONE} before archiving it`,
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/reorder" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${moveToDonePayload}'`,
    "",
    "# Archive the completed task",
    'curl -X POST "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID/archive" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
    "",
    "# Read tasks again and capture the attachment downloadUrl for the uploaded file",
    'curl "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
    "",
    "# Verify the uploaded file downloads successfully",
    'curl -L "$NEXUSDASH_BASE_URL$DOWNLOAD_URL" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}" \\`,
    '  --output "./downloaded-smoke-image.png"',
    "",
    "# Delete the task when finished",
    'curl -X DELETE "$NEXUSDASH_BASE_URL/api/projects/$NEXUSDASH_PROJECT_ID/tasks/$TASK_ID" \\',
    `  -H "Authorization: Bearer $${AGENT_BEARER_TOKEN_ENV_NAME}"`,
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

function getAgentEndpointDefinition(
  method: AgentHttpMethod,
  path: string
): AgentApiEndpointDefinition {
  const endpoint = AGENT_API_ENDPOINTS.find(
    (candidate) => candidate.method === method && candidate.path === path
  );
  if (!endpoint) {
    throw new Error(`Missing agent endpoint definition for ${method} ${path}`);
  }

  return endpoint;
}

function buildOperationMetadata(method: AgentHttpMethod, path: string) {
  const endpoint = getAgentEndpointDefinition(method, path);

  return {
    tags: [endpoint.tag],
    summary: endpoint.title,
    description: `${buildEndpointDescription(endpoint)}\n\n${buildSecurityScopesDescription(
      endpoint.requiredScopes
    )}`,
  } as const;
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
        description:
          "Create, read, update, reorder, archive, delete, and attach files to project tasks.",
      },
      {
        name: "Context",
        description:
          "Create, read, update, delete, and attach files to project context cards.",
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
        ApiKeyAuthorization: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description:
            "Project API key used for token exchange. Send as `Authorization: ApiKey <api_key>`.",
        },
        AgentApiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "x-agent-api-key",
          description:
            "Alternate project API key header for token exchange when the Authorization header is unavailable.",
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
        AttachmentLinkInput: {
          type: "object",
          required: ["url"],
          properties: {
            name: {
              type: "string",
            },
            url: {
              type: "string",
              format: "uri",
            },
          },
        },
        AttachmentRecord: {
          type: "object",
          required: [
            "id",
            "kind",
            "name",
            "url",
            "mimeType",
            "sizeBytes",
            "downloadUrl",
          ],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["file", "link"] },
            name: { type: "string" },
            url: { type: ["string", "null"], format: "uri" },
            mimeType: { type: ["string", "null"] },
            sizeBytes: { type: ["integer", "null"] },
            downloadUrl: { type: ["string", "null"] },
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
            "attachments",
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
            attachments: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AttachmentRecord",
              },
            },
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
              type: "array",
              items: {
                type: "string",
              },
            },
            relatedTaskIds: {
              type: "array",
              items: {
                type: "string",
              },
            },
            attachmentLinks: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AttachmentLinkInput",
              },
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
          required: ["id", "title", "content", "color", "createdAt", "attachments"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            color: {
              type: "string",
              enum: CONTEXT_CARD_COLORS,
            },
            createdAt: { type: "string", format: "date-time" },
            attachments: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AttachmentRecord",
              },
            },
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
                $ref: "#/components/schemas/AttachmentRecord",
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
              type: "array",
              items: {
                $ref: "#/components/schemas/AttachmentLinkInput",
              },
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
        AttachmentUploadTargetRequest: {
          type: "object",
          required: ["name", "mimeType", "sizeBytes"],
          properties: {
            name: { type: "string" },
            mimeType: { type: "string" },
            sizeBytes: { type: "integer" },
          },
        },
        AttachmentUploadTargetResponse: {
          type: "object",
          required: ["upload"],
          properties: {
            upload: {
              type: "object",
              required: [
                "storageKey",
                "uploadUrl",
                "method",
                "headers",
                "expiresInSeconds",
                "maxFileSizeBytes",
                "maxFileSizeLabel",
              ],
              properties: {
                storageKey: { type: "string" },
                uploadUrl: { type: "string" },
                method: { type: "string", enum: ["PUT"] },
                headers: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                expiresInSeconds: { type: "integer" },
                maxFileSizeBytes: { type: "integer" },
                maxFileSizeLabel: { type: "string" },
              },
            },
          },
        },
        AttachmentDirectFinalizeRequest: {
          type: "object",
          required: ["storageKey", "name", "mimeType", "sizeBytes"],
          properties: {
            storageKey: { type: "string" },
            name: { type: "string" },
            mimeType: { type: "string" },
            sizeBytes: { type: "integer" },
          },
        },
        AttachmentDirectFinalizeResponse: {
          type: "object",
          required: ["attachment"],
          properties: {
            attachment: {
              $ref: "#/components/schemas/AttachmentRecord",
            },
          },
        },
        AttachmentDirectCleanupRequest: {
          type: "object",
          required: ["storageKey"],
          properties: {
            storageKey: { type: "string" },
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
        AttachmentId: {
          name: "attachmentId",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
        AgentTokenAuthorizationHeader: {
          name: "Authorization",
          in: "header",
          required: false,
          schema: {
            type: "string",
          },
          description:
            "Project API key header for token exchange. Example: `Authorization: ApiKey nda_public.secret`.",
        },
        AgentTokenApiKeyHeader: {
          name: "x-agent-api-key",
          in: "header",
          required: false,
          schema: {
            type: "string",
          },
          description: "Alternate project API key header for token exchange.",
        },
      },
    },
    paths: {
      "/api/auth/agent/token": {
        post: {
          ...buildOperationMetadata("POST", "/api/auth/agent/token"),
          security: [{ ApiKeyAuthorization: [] }, { AgentApiKeyHeader: [] }],
          parameters: [
            { $ref: "#/components/parameters/AgentTokenAuthorizationHeader" },
            { $ref: "#/components/parameters/AgentTokenApiKeyHeader" },
          ],
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
          ...buildOperationMetadata("GET", "/api/projects/{projectId}"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("GET", "/api/projects/{projectId}/tasks"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("POST", "/api/projects/{projectId}/tasks"),
          security: [{ BearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
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
          ...buildOperationMetadata("PATCH", "/api/projects/{projectId}/tasks/{taskId}"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("DELETE", "/api/projects/{projectId}/tasks/{taskId}"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("POST", "/api/projects/{projectId}/tasks/reorder"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("POST", "/api/projects/{projectId}/tasks/{taskId}/archive"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("DELETE", "/api/projects/{projectId}/tasks/{taskId}/archive"),
          security: [{ BearerAuth: [] }],
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
      "/api/projects/{projectId}/tasks/{taskId}/attachments/upload-url": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/tasks/{taskId}/attachments/upload-url"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentUploadTargetRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed upload target returned",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AttachmentUploadTargetResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks/{taskId}/attachments/direct": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/tasks/{taskId}/attachments/direct"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentDirectFinalizeRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Attachment attached to task",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AttachmentDirectFinalizeResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/tasks/{taskId}/attachments/direct/cleanup": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/tasks/{taskId}/attachments/direct/cleanup"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentDirectCleanupRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Uploaded object cleaned up",
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
      "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}": {
        delete: {
          ...buildOperationMetadata(
            "DELETE",
            "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
            { $ref: "#/components/parameters/AttachmentId" },
          ],
          responses: {
            200: {
              description: "Task attachment deleted",
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
      "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download": {
        get: {
          ...buildOperationMetadata(
            "GET",
            "/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/TaskId" },
            { $ref: "#/components/parameters/AttachmentId" },
          ],
          responses: {
            200: {
              description: "Attachment bytes returned inline or as a proxied response",
              content: {
                "application/octet-stream": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            307: {
              description: "Temporary redirect to a signed storage URL",
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/context-cards": {
        get: {
          ...buildOperationMetadata("GET", "/api/projects/{projectId}/context-cards"),
          security: [{ BearerAuth: [] }],
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
          ...buildOperationMetadata("POST", "/api/projects/{projectId}/context-cards"),
          security: [{ BearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ProjectId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
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
          ...buildOperationMetadata("PATCH", "/api/projects/{projectId}/context-cards/{cardId}"),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
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
          ...buildOperationMetadata("DELETE", "/api/projects/{projectId}/context-cards/{cardId}"),
          security: [{ BearerAuth: [] }],
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
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/upload-url": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/context-cards/{cardId}/attachments/upload-url"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentUploadTargetRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed upload target returned",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AttachmentUploadTargetResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentDirectFinalizeRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Attachment attached to context card",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AttachmentDirectFinalizeResponse",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct/cleanup": {
        post: {
          ...buildOperationMetadata(
            "POST",
            "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct/cleanup"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AttachmentDirectCleanupRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Uploaded object cleaned up",
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
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}": {
        delete: {
          ...buildOperationMetadata(
            "DELETE",
            "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
            { $ref: "#/components/parameters/AttachmentId" },
          ],
          responses: {
            200: {
              description: "Context attachment deleted",
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
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}/download": {
        get: {
          ...buildOperationMetadata(
            "GET",
            "/api/projects/{projectId}/context-cards/{cardId}/attachments/{attachmentId}/download"
          ),
          security: [{ BearerAuth: [] }],
          parameters: [
            { $ref: "#/components/parameters/ProjectId" },
            { $ref: "#/components/parameters/CardId" },
            { $ref: "#/components/parameters/AttachmentId" },
          ],
          responses: {
            200: {
              description: "Attachment bytes returned inline or as a proxied response",
              content: {
                "application/octet-stream": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            307: {
              description: "Temporary redirect to a signed storage URL",
            },
            ...commonErrorResponses,
          },
        },
      },
    },
  } as const;
}
