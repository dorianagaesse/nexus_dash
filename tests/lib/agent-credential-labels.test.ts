import { describe, expect, test } from "vitest";

import {
  parseAgentCredentialDescriptiveLabels,
  parseAgentCredentialDescriptiveLabelsDraft,
} from "@/lib/agent-credential-labels";

describe("credential descriptive labels", () => {
  test("normalizes whitespace and duplicate labels without mixing in credential names", () => {
    expect(parseAgentCredentialDescriptiveLabels([" GPT-6 ", "Codex", "gpt-6"])).toEqual(["GPT-6", "Codex"]);
    expect(parseAgentCredentialDescriptiveLabels([])).toEqual([]);
    expect(parseAgentCredentialDescriptiveLabelsDraft("  ")).toEqual([]);
    expect(parseAgentCredentialDescriptiveLabelsDraft("GPT-6, Codex")).toEqual(["GPT-6", "Codex"]);
  });
  test.each([null, "GPT-6", {}, [12], [""], [" "], ["a".repeat(41)], Array.from({ length: 6 }, (_, index) => `model-${index}`), ["a\nb"], ["a,b"]])("rejects invalid descriptive metadata: %j", (value) => {
    expect(parseAgentCredentialDescriptiveLabels(value)).toBeNull();
  });
  test("applies the count limit to distinct labels for arrays and comma drafts", () => {
    const input = ["GPT-6", "gpt-6", "A", "B", "C", "D"];
    expect(parseAgentCredentialDescriptiveLabels(input)).toEqual(["GPT-6", "A", "B", "C", "D"]);
    expect(parseAgentCredentialDescriptiveLabelsDraft(input.join(", "))).toEqual(["GPT-6", "A", "B", "C", "D"]);
    expect(parseAgentCredentialDescriptiveLabels(Array(6).fill("model"))).toEqual(["model"]);
    expect(parseAgentCredentialDescriptiveLabels([...input, "E"])).toBeNull();
  });
  test("accepts boundaries and rejects empty comma-delimited entries", () => {
    expect(parseAgentCredentialDescriptiveLabels(Array.from({length: 5}, (_, i) => String(i).repeat(40)))).toHaveLength(5);
    expect(parseAgentCredentialDescriptiveLabelsDraft("GPT-6,,Codex")).toBeNull();
  });
});
