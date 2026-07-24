import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/app-metadata", () => ({
  getAppMetadataSummary: () => ({
    repositoryUrl: "https://github.com/example/nexusdash",
    versionTag: "v0.27.0",
    versionLabel: "v0.27.0",
    revision: "abc1234",
    revisionLabel: "build abc1234",
    environment: "test",
    diagnosticLabel: "v0.27.0 | test | build abc1234",
  }),
}));

import { AppAboutCard } from "@/components/account/app-about-card";

(globalThis as { React?: typeof React }).React = React;

describe("app-about-card", () => {
  test("shows version and a recognizable GitHub repository link", () => {
    const result = renderToStaticMarkup(<AppAboutCard />);

    expect(result).toContain("About NexusDash");
    expect(result).toContain("App version");
    expect(result).toContain("v0.27.0");
    expect(result).toContain('href="https://github.com/example/nexusdash"');
    expect(result).toContain('aria-label="Open NexusDash repository on GitHub"');
    expect(result).toContain("GitHub repository");
  });
});
