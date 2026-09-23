import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AgentOnboardingSection } from "@/components/agent-onboarding/agent-onboarding-section";

(globalThis as { React?: typeof React }).React = React;

describe("agent-onboarding-section", () => {
  test("renders a collapsed disclosure that keeps its content mounted", () => {
    const result = renderToStaticMarkup(
      React.createElement(
        AgentOnboardingSection,
        { title: "Scope model" },
        React.createElement("p", null, "Body copy")
      )
    );

    const controls = result.match(/aria-controls="([^"]+)"/)?.[1];
    const contentClasses = controls
      ? result.match(new RegExp(`class="([^"]*)" id="${controls}"`))?.[1]
      : undefined;

    expect(result).toContain('aria-expanded="false"');
    expect(result).toContain("Scope model");
    expect(controls).toBeTruthy();
    expect(contentClasses).toBeDefined();
    expect(contentClasses).toContain("hidden");
    expect(result).toContain("Body copy");
  });

  test("renders an expanded disclosure when defaultOpen is set", () => {
    const result = renderToStaticMarkup(
      React.createElement(
        AgentOnboardingSection,
        { title: "Where credentials live", defaultOpen: true },
        React.createElement("p", null, "Step one")
      )
    );

    const controls = result.match(/aria-controls="([^"]+)"/)?.[1];
    const contentClasses = controls
      ? result.match(new RegExp(`class="([^"]*)" id="${controls}"`))?.[1]
      : undefined;

    expect(result).toContain('aria-expanded="true"');
    expect(contentClasses).toBeDefined();
    expect(contentClasses).not.toContain("hidden");
    expect(result).toContain("Step one");
  });
});
