import { beforeEach, describe, expect, test, vi } from "vitest";

const resolveRequestOriginFromHeadersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/request-origin", () => ({
  resolveRequestOriginFromHeaders: resolveRequestOriginFromHeadersMock,
}));

import { GET } from "@/app/api/docs/agent/v1/openapi.json/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("GET /api/docs/agent/v1/openapi.json", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestOriginFromHeadersMock.mockReturnValue("https://preview.nexusdash.test");
  });

  test("returns the current deployment origin and stable agent paths", async () => {
    const response = await GET(
      new Request("https://preview.nexusdash.test/api/docs/agent/v1/openapi.json") as never
    );

    const payload = await readJson(response);
    const servers = payload.servers as Array<{ url?: string }> | undefined;
    const paths = payload.paths as Record<string, unknown> | undefined;
    const components = payload.components as
      | {
          securitySchemes?: Record<string, unknown>;
        }
      | undefined;
    const tokenExchangePath = (
      paths?.["/api/auth/agent/token"] as
        | {
            post?: {
              security?: Array<Record<string, unknown>>;
            };
          }
        | undefined
    )?.post;

    expect(response.status).toBe(200);
    expect(payload.openapi).toBe("3.1.0");
    expect(payload.info).toMatchObject({
      version: "v1",
    });
    expect(servers?.[0]?.url).toBe("https://preview.nexusdash.test");
    expect(paths).toHaveProperty("/api/auth/agent/token");
    expect(paths).toHaveProperty("/api/projects/{projectId}/tasks");
    expect(paths).toHaveProperty(
      "/api/projects/{projectId}/tasks/{taskId}/attachments/upload-url"
    );
    expect(paths).toHaveProperty("/api/projects/{projectId}/context-cards/{cardId}");
    expect(paths).toHaveProperty(
      "/api/projects/{projectId}/context-cards/{cardId}/attachments/direct"
    );
    expect(components?.securitySchemes).toHaveProperty("BearerAuth");
    expect(components?.securitySchemes).toHaveProperty("ApiKeyAuthorization");
    expect(components?.securitySchemes).toHaveProperty("AgentApiKeyHeader");
    expect(tokenExchangePath?.security).toEqual([
      { ApiKeyAuthorization: [] },
      { AgentApiKeyHeader: [] },
    ]);
    expect(JSON.stringify(payload)).toContain("deadlineDate");
    expect(resolveRequestOriginFromHeadersMock).toHaveBeenCalledWith(expect.any(Headers));
  });
});
