import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const requireSessionUserIdFromServerMock = vi.hoisted(() => vi.fn());
const resolveRequestOriginFromHeadersMock = vi.hoisted(() => vi.fn());
const getAccountIdentitySummaryMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/auth/server-guard", () => ({
  requireSessionUserIdFromServer: requireSessionUserIdFromServerMock,
}));

vi.mock("@/lib/http/request-origin", () => ({
  resolveRequestOriginFromHeaders: resolveRequestOriginFromHeadersMock,
}));

vi.mock("@/lib/services/account-identity-service", () => ({
  getAccountIdentitySummary: getAccountIdentitySummaryMock,
}));

import AccountDeveloperSettingsPage from "@/app/account/settings/developers/page";
import AgentApiDocsPage from "@/app/docs/agent/v1/page";

(globalThis as { React?: typeof React }).React = React;

describe("agent onboarding pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockReturnValue(new Headers());
    requireSessionUserIdFromServerMock.mockResolvedValue("user-1");
    getAccountIdentitySummaryMock.mockResolvedValue({
      displayName: "test.user",
      username: "test.user",
      usernameDiscriminator: "1234",
      usernameTag: "test.user#1234",
      avatarSeed: "seed-123",
    });
  });

  test("renders hosted docs with concrete SSR URLs", async () => {
    resolveRequestOriginFromHeadersMock.mockReturnValue("https://docs-preview.nexusdash.test");

    const page = await AgentApiDocsPage();
    const result = renderToStaticMarkup(page);

    expect(resolveRequestOriginFromHeadersMock).toHaveBeenCalledWith(expect.any(Headers));
    expect(result).toContain("NEXUSDASH_BASE_URL=https://docs-preview.nexusdash.test");
    expect(result).toContain(
      "NEXUSDASH_AGENT_OPENAPI_URL=https://docs-preview.nexusdash.test/api/docs/agent/v1/openapi.json"
    );
  });

  test("renders account onboarding with concrete SSR URLs", async () => {
    resolveRequestOriginFromHeadersMock.mockReturnValue("https://account-preview.nexusdash.test");

    const page = await AccountDeveloperSettingsPage();
    const result = renderToStaticMarkup(page);

    expect(requireSessionUserIdFromServerMock).toHaveBeenCalledOnce();
    expect(resolveRequestOriginFromHeadersMock).toHaveBeenCalledWith(expect.any(Headers));
    expect(result).toContain("NEXUSDASH_BASE_URL=https://account-preview.nexusdash.test");
    expect(result).toContain(
      "NEXUSDASH_AGENT_DOCS_URL=https://account-preview.nexusdash.test/docs/agent/v1"
    );
  });
});
