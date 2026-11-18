// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProjectAgentCredentialForm } from "@/components/project-dashboard/project-agent-credential-form";
import {
  AGENT_CREDENTIAL_PRESETS,
  AGENT_SCOPE_DEFINITIONS,
  type AgentScope,
} from "@/lib/agent-access";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    (candidate.textContent ?? "").includes(text)
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button as HTMLButtonElement;
}

function getCheckedScopes(container: HTMLElement): AgentScope[] {
  const checked = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((input) => input.checked).map((input) => input.value);
  return AGENT_SCOPE_DEFINITIONS.filter(({ scope }) => checked.includes(scope)).map(({ scope }) => scope);
}

describe("ProjectDashboardOwnerAgentAccessPanel preset application", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("applying every preset submits exactly that preset's scopes", async () => {
    const onCreateCredential = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(ProjectAgentCredentialForm, {
          isCreating: false,
          error: null,
          onCreate: onCreateCredential,
          onCancel: () => {},
        })
      );
    });

    const labelInput = container.querySelector(
      "#project-agent-label"
    ) as HTMLInputElement;

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      valueSetter?.call(labelInput, "Preset bot");
      labelInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(getCheckedScopes(container)).toEqual([
      "project:read",
      "task:read",
      "task:write",
    ]);

    for (const preset of AGENT_CREDENTIAL_PRESETS) {
      await act(async () => {
        const select = container.querySelector("#project-agent-preset") as HTMLSelectElement;
        select.value = preset.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect((container.querySelector("#project-agent-preset") as HTMLSelectElement).value).toBe(preset.id);
      expect(getCheckedScopes(container)).toEqual(preset.scopes);

      await act(async () => {
        findButton(container, "Create credential").dispatchEvent(
          new MouseEvent("click", { bubbles: true })
        );
      });

      const calls = onCreateCredential.mock.calls;
      const lastCall = calls[calls.length - 1][0] as {
        label: string;
        scopes: AgentScope[];
      };
      expect(lastCall.label).toBe("Preset bot");
      expect(lastCall.scopes).toEqual(preset.scopes);
    }

    expect(onCreateCredential).toHaveBeenCalledTimes(
      AGENT_CREDENTIAL_PRESETS.length
    );

    await act(async () => {
      root.unmount();
    });
  });
});
