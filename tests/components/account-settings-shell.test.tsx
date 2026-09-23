// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AccountSettingsShell } from "@/components/account/account-settings-shell";

(globalThis as { React?: typeof React }).React = React;

function renderShell(activeTab: "calendar" | "developers") {
  return renderToStaticMarkup(
    <AccountSettingsShell
      activeTab={activeTab}
      title="Section title"
      description="Section description"
      returnTo="/projects"
    >
      <div>Tab content</div>
    </AccountSettingsShell>
  );
}

describe("account settings shell", () => {
  test("renders one privacy policy link to the public page", () => {
    const container = document.createElement("div");
    container.innerHTML = renderShell("calendar");

    const privacyLinks = container.querySelectorAll('a[href="/privacy"]');
    expect(privacyLinks).toHaveLength(1);
    expect(privacyLinks[0]?.textContent?.trim()).toBe("Privacy policy");
  });

  test("keeps the privacy policy link on the developer tab", () => {
    const container = document.createElement("div");
    container.innerHTML = renderShell("developers");

    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
  });
});
