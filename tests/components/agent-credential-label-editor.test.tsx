// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { AgentCredentialLabelEditor } from "@/components/project-dashboard/agent-credential-label-editor";
(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("adds chips only with Enter, shows the hint while typing with focus, and preserves failed saves", async () => {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const click = async (name: string) => { await act(async () => {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === name || b.getAttribute("aria-label") === name);
    expect(button).toBeTruthy(); button!.click();
  }); };
  const fill = async (value: string) => { await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); };
  const enter = async () => { await act(async () => {
    container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }); };
  const hint = () => container.querySelector('[id$="-hint"]')!.textContent;
  try {
    await act(async () => root.render(<AgentCredentialLabelEditor credentialId="c" name="Bot" labels={["GPT-6"]} disabled={false} onSave={onSave} />));
    await click("Edit labels");
    expect(container.querySelector("input")!.value).toBe("");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(hint()).not.toContain("Press Enter");
    await fill("Codex");
    expect(hint()).toBe("Press Enter to add a label");
    await act(async () => container.querySelector("input")!.blur());
    expect(hint()).not.toContain("Press Enter");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    await click("Save labels");
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector("input"));
    await enter();
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("input")!.value).toBe("");
    expect(hint()).not.toContain("Press Enter");
    await click("Save labels");
    expect(onSave).toHaveBeenLastCalledWith(["GPT-6", "Codex"]);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("retry");
    await click("Save labels");
    expect(container.querySelector("input")).toBeNull();
    await click("Edit labels"); await click("Remove label GPT-6"); await click("Save labels");
    expect(onSave).toHaveBeenLastCalledWith([]);
    await click("Edit labels"); await fill("Discard"); await enter(); await click("Cancel");
    expect(onSave).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test("restores focus after a successful save once the parent enables the edit trigger", async () => {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let finishSave!: (saved: boolean) => void;
  const saved = new Promise<boolean>((resolve) => { finishSave = resolve; });
  const frames: FrameRequestCallback[] = [];
  const animationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
  const render = async (disabled: boolean) => act(async () => root.render(
    <AgentCredentialLabelEditor credentialId="c" name="Bot" labels={["Codex"]} disabled={disabled} onSave={() => saved} />
  ));
  try {
    await render(false);
    await act(async () => container.querySelector("button")!.click());
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save labels")!.click());
    await render(true);
    await act(async () => { finishSave(true); });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Edit descriptive labels for Bot"]')!;
    expect(trigger.disabled).toBe(true);
    await act(async () => { frames.splice(0).forEach(callback => callback(0)); });
    await render(false);
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount()); container.remove(); animationFrame.mockRestore();
  }
});

test("validates individual labels and limits, preserves invalid input, and combines duplicate labels", async () => {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const onSave = vi.fn().mockResolvedValue(true);
  const add = async (value: string) => {
    await act(async () => {
      const input = container.querySelector("input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  };
  try {
    await act(async () => root.render(<AgentCredentialLabelEditor credentialId="c" name="Bot" labels={[]} disabled={false} onSave={onSave} />));
    await act(async () => container.querySelector("button")!.click());
    await add("x".repeat(41));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("40 characters");
    expect(container.querySelector("input")!.value).toHaveLength(41);
    await add("GPT-6,Codex");
    expect(container.querySelectorAll("li")).toHaveLength(0);
    for (const value of ["GPT-6", "gpt-6", "A", "B", "C", "D"]) await add(value);
    expect(container.querySelectorAll("li")).toHaveLength(5);
    await add("E");
    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect(container.querySelector("input")!.value).toBe("E");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("5 distinct labels");
    expect(onSave).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
