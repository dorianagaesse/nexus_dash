import { afterEach, expect, test, vi } from "vitest";
import {
  bindingKey,
  openRuntime,
  pairDevice,
  projectRequestUrl,
} from "../../scripts/agent-runtime/client.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const binding = {
  base: "https://nexus-dash.app",
  projectId: "project",
  identityId: "oscar",
};

test("vault bindings distinguish origin, project and identity with no fallback", () => {
  const key = bindingKey(binding);
  expect(bindingKey({ ...binding, identityId: "nova" })).not.toBe(key);
  expect(bindingKey({ ...binding, projectId: "other" })).not.toBe(key);
  expect(
    bindingKey({ ...binding, base: "https://preview.example.com" })
  ).not.toBe(key);
  expect(() => bindingKey({ ...binding, identityId: "" })).toThrow();
  expect(() =>
    bindingKey({ ...binding, base: "http://untrusted.example.com" })
  ).toThrow();
});

test.each([
  "https://evil.test/",
  "//evil.test/",
  "/api/projects/other/tasks",
  "/api/projects/project/../other/tasks",
  "/api/projects/project/%2e%2e/other",
  "/api/projects/project/%2Fother",
  "/api/auth/agent/token",
  "/api/projects/project\\..\\other",
])("rejects project escape: %s", (path) => {
  expect(() =>
    projectRequestUrl(binding.base, binding.projectId, path)
  ).toThrow();
});

test("pairing saves authentication material to the vault under the exact binding", async () => {
  const write = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          projectId: "project",
          identityId: "oscar",
          runtimeCredential: "private-device-proof",
        })
      )
  );
  await pairDevice(binding, "one-time-code", { write });
  expect(write).toHaveBeenCalledWith(
    bindingKey(binding),
    "private-device-proof"
  );
});

test("two concurrent launches have distinct local capabilities, renew the same session, and never forward the device proof", async () => {
  const realFetch = globalThis.fetch;
  let sequence = 0;
  const calls: {
    path: string;
    body: Record<string, unknown>;
    authorization?: string;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (new URL(String(url)).hostname === "127.0.0.1")
        return realFetch(url, options);
      const path = new URL(String(url)).pathname;
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push({ path, body, authorization: options.headers.authorization });
      if (path.endsWith("/runtime")) {
        if (body.operation === "end") return Response.json({ ended: true });
        return Response.json({
          projectId: "project",
          identityId: "oscar",
          deviceId: "laptop",
          sessionId: body.sessionId ?? `session-${++sequence}`,
          accessToken: "short-token",
          expiresInSeconds: body.operation === "start" ? 1 : 300,
        });
      }
      return Response.json({ tasks: [] });
    })
  );
  const vault = { read: vi.fn().mockResolvedValue("private-device-proof") };
  const a = await openRuntime(binding, vault, "Codex");
  const b = await openRuntime(binding, vault, "Gemini");
  try {
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.capability).not.toBe(b.capability);
    const path = "/api/projects/project/tasks";
    expect(
      (
        await realFetch(a.url + path, {
          headers: { authorization: `Bearer ${b.capability}` },
        })
      ).status
    ).toBe(401);
    expect(
      (
        await realFetch(a.url + path, {
          headers: {
            authorization: `Bearer ${a.capability}`,
            origin: "https://evil.test",
          },
        })
      ).status
    ).toBe(401);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);
    const response = await realFetch(a.url + path, {
      headers: { authorization: `Bearer ${a.capability}` },
    });
    expect(response.status).toBe(200);
    expect(
      calls.find((c) => c.body.operation === "renew")?.body.sessionId
    ).toBe(a.sessionId);
    expect(calls.find((c) => c.path === path)?.authorization).toBe(
      "Bearer short-token"
    );
    expect(
      JSON.stringify(calls.filter((c) => !c.path.endsWith("/runtime")))
    ).not.toContain("private-device-proof");
  } finally {
    await a.close();
    await b.close();
  }
});

test("terminal renewal rejection stops exchanges for that execution", async () => {
  const realFetch = globalThis.fetch;
  let renewals = 0;
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (new URL(String(url)).hostname === "127.0.0.1") return realFetch(url, options);
    const body = JSON.parse(options.body);
    if (body.operation === "renew") { renewals++; return Response.json({ error: "revoked" }, { status: 401 }); }
    if (body.operation === "end") return Response.json({ ended: true });
    return Response.json({ projectId: "project", identityId: "oscar", deviceId: "device", sessionId: "session", accessToken: "short", expiresInSeconds: 1 });
  }));
  const runtime = await openRuntime(binding, { read: async () => "proof" }, "test");
  try {
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);
    const request = () => realFetch(runtime.url + "/api/projects/project/tasks", { headers: { authorization: `Bearer ${runtime.capability}` } });
    expect((await request()).status).toBe(403);
    expect((await request()).status).toBe(401);
    expect((await request()).status).toBe(401);
    expect(renewals).toBe(1);
  } finally { await runtime.close(); }
});
