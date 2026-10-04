import { beforeEach, describe, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAuthenticatedApiUser: vi.fn() }));
const tokens = vi.hoisted(() => ({ issueRealtimeToken: vi.fn() }));
vi.mock("@/lib/auth/api-guard", () => auth);
vi.mock("@/lib/services/realtime-token-service", () => tokens);

import { POST } from "@/app/api/realtime/token/route";

describe("POST /api/realtime/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REALTIME_TRANSPORT", "broadcast");
  });

  test("rejects anonymous and agent requests", async () => {
    auth.requireAuthenticatedApiUser.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    });
    const response = await POST(new Request("http://localhost/api/realtime/token", {
      method: "POST", headers: { authorization: "Bearer agent-token" },
    }) as never);
    expect(response.status).toBe(401);
    expect(tokens.issueRealtimeToken).not.toHaveBeenCalled();
  });

  test("returns a no-store session token", async () => {
    auth.requireAuthenticatedApiUser.mockResolvedValue({ ok: true, userId: "user-1" });
    tokens.issueRealtimeToken.mockReturnValue({
      token: "jwt", expiresAt: "2026-10-03T23:00:00.000Z",
      supabaseUrl: "https://preview-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_preview",
    });
    const response = await POST(new Request("http://localhost/api/realtime/token", {
      method: "POST",
    }) as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(tokens.issueRealtimeToken).toHaveBeenCalledWith("user-1");
    expect((await response.json()).token).toBe("jwt");
  });
});
