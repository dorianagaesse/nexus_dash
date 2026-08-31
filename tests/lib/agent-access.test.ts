import { describe, expect, test } from "vitest";

import {
  AGENT_CREDENTIAL_PRESETS,
  AGENT_SCOPE_VALUES,
  DEFAULT_AGENT_CREDENTIAL_PRESET_ID,
  parseAgentScopes,
  resolveAgentCredentialPreset,
} from "@/lib/agent-access";

describe("agent credential presets", () => {
  test("every preset uses only valid, deduplicated, vocabulary-ordered scopes", () => {
    for (const preset of AGENT_CREDENTIAL_PRESETS) {
      expect(preset.scopes.length).toBeGreaterThan(0);
      expect(new Set(preset.scopes).size).toBe(preset.scopes.length);
      expect(preset.scopes.every((scope) => AGENT_SCOPE_VALUES.includes(scope))).toBe(true);
      expect(preset.scopes).toEqual(parseAgentScopes(preset.scopes));
    }
  });

  test("the recommended preset grants read and write without delete", () => {
    const recommended = AGENT_CREDENTIAL_PRESETS.find((preset) => preset.recommended);
    expect(recommended?.id).toBe("read-write");
    expect(recommended?.scopes).toEqual(["project:read", "task:read", "task:write"]);
    expect(recommended?.scopes).not.toContain("task:delete");
  });

  test("the default preset id resolves to the recommended preset", () => {
    const defaultPreset = resolveAgentCredentialPreset(DEFAULT_AGENT_CREDENTIAL_PRESET_ID);
    expect(defaultPreset?.recommended).toBe(true);
  });

  test("unknown preset ids resolve to null", () => {
    expect(resolveAgentCredentialPreset("unknown")).toBeNull();
  });

  test("preset ids are unique", () => {
    const ids = AGENT_CREDENTIAL_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
