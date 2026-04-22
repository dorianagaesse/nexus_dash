import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AgentOnboardingGuide } from "@/components/agent-onboarding/agent-onboarding-guide";

(globalThis as { React?: typeof React }).React = React;

describe("agent-onboarding-guide", () => {
  test("renders hosted-doc onboarding copy, env block, and stable endpoint list", () => {
    const result = renderToStaticMarkup(
      React.createElement(AgentOnboardingGuide, {
        initialAppOrigin: "https://preview.nexusdash.test",
      })
    );

    expect(result).toContain("Quickstart environment");
    expect(result).toContain("NEXUSDASH_BASE_URL=https://preview.nexusdash.test");
    expect(result).toContain("NEXUSDASH_AGENT_OPENAPI_URL=https://preview.nexusdash.test/api/docs/agent/v1/openapi.json");
    expect(result).toContain("Authentication flow");
    expect(result).toContain("Supported endpoints");
    expect(result).toContain("/api/projects/{projectId}/epics");
    expect(result).toContain("/api/projects/{projectId}/tasks");
    expect(result).toContain("/api/projects/{projectId}/tasks/{taskId}/comments");
    expect(result).toContain("application/json");
    expect(result).toContain("deadlineDate");
    expect(result).toContain("epicId");
    expect(result).toContain("Agent limitations");
    expect(result).toContain("/attachments/upload-url");
    expect(result).toContain("/context-cards/$CARD_ID/attachments/upload-url");
    expect(result).toContain("Move the task to Done before archiving it");
  });

  test("keeps long code and endpoint content inside shrinkable mobile-safe containers", () => {
    const result = renderToStaticMarkup(
      React.createElement(AgentOnboardingGuide, {
        initialAppOrigin: "https://preview.nexusdash.test",
      })
    );

    expect(result).toContain("min-w-0 max-w-full overflow-x-auto");
    expect(result).toContain("class=\"block min-w-max\"");
    expect(result).toContain("class=\"min-w-0 flex-1 space-y-2\"");
    expect(result).toContain("class=\"break-all [overflow-wrap:anywhere]\"");
  });
});
