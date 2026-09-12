import { describe, expect, test } from "vitest";

import {
  getProjectActorKey,
  hasProjectActorChanged,
  type ProjectActorSummary,
} from "@/lib/project-actor";

describe("hasProjectActorChanged", () => {
  test("treats matching actor keys as unchanged", () => {
    expect(
      hasProjectActorChanged(
        { kind: "human", id: "user-1" },
        { kind: "human", id: "user-1" }
      )
    ).toBe(false);
    expect(
      hasProjectActorChanged(
        { kind: "agent", id: "credential-1" },
        { kind: "agent", id: "credential-1" }
      )
    ).toBe(false);
  });

  test("detects a kind swap that keeps the same id", () => {
    expect(
      hasProjectActorChanged(
        { kind: "human", id: "shared-id" },
        { kind: "agent", id: "shared-id" }
      )
    ).toBe(true);
  });

  test("detects assignment, reassignment, and clearing", () => {
    expect(hasProjectActorChanged(null, { kind: "agent", id: "cred-1" })).toBe(
      true
    );
    expect(
      hasProjectActorChanged(
        { kind: "agent", id: "cred-1" },
        { kind: "agent", id: "cred-2" }
      )
    ).toBe(true);
    expect(
      hasProjectActorChanged({ kind: "agent", id: "cred-1" }, null)
    ).toBe(true);
  });

  test("treats two empty draft slots as unchanged", () => {
    expect(hasProjectActorChanged(null, null)).toBe(false);
  });

  test("compares full summaries by key so an unchanged revoked assignee stays as-is", () => {
    const storedAssignee: ProjectActorSummary = {
      kind: "agent",
      id: "credential-revoked",
      displayName: "Retired bot",
      usernameTag: null,
      avatarSeed: null,
      status: "revoked",
      isAssignable: false,
    };
    expect(
      hasProjectActorChanged(storedAssignee, {
        kind: "agent",
        id: "credential-revoked",
      })
    ).toBe(false);
    expect(getProjectActorKey({ kind: "agent", id: "credential-revoked" })).toBe(
      "agent:credential-revoked"
    );
  });
});
