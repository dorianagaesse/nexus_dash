// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { AgentCredentialLabelEditor } from "@/components/project-dashboard/agent-credential-label-editor";
(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("edits, validates, retries and removes labels with explicit save", async () => {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const click = async (name: string) => { await act(async () => {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === name);
    expect(button).toBeTruthy(); button!.click();
  }); };
  const fill = async (value: string) => { await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); };
  try {
    await act(async () => root.render(<AgentCredentialLabelEditor credentialId="c" name="Bot" labels={["GPT-6"]} disabled={false} onSave={onSave} />));
    await click("Edit labels");
    expect(container.querySelector("input")!.value).toBe("GPT-6");
    await fill("a".repeat(41)); await click("Save labels");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("40 characters");
    expect(onSave).not.toHaveBeenCalled();
    await fill(" Codex, GPT-6 "); await click("Save labels");
    expect(onSave).toHaveBeenLastCalledWith(["Codex", "GPT-6"]);
    expect(container.querySelector("input")!.value).toBe(" Codex, GPT-6 ");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("retry");
    await click("Save labels");
    expect(container.querySelector("input")).toBeNull();
    await click("Edit labels"); await fill(""); await click("Save labels");
    expect(onSave).toHaveBeenLastCalledWith([]);
    await click("Edit labels"); await fill("Discard"); await click("Cancel");
    expect(onSave).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
