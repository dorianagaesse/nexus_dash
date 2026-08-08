import { describe, expect, test } from "vitest";

import {
  getContextCardActorKey,
  getHistoricalContextCardActorId,
  isContextCardActorReference,
} from "@/lib/context-card-actor";

describe("context-card-actor", () => {
  test("encodes the actor reference as kind:id", () => {
    expect(
      getContextCardActorKey({ kind: "human", id: "user-1" })
    ).toBe("human:user-1");
    expect(
      getContextCardActorKey({ kind: "agent", id: "cred-1" })
    ).toBe("agent:cred-1");
  });

  test("derives a stable historical id from the snapshot", () => {
    expect(
      getHistoricalContextCardActorId({
        kind: "human",
        displayNameSnapshot: "  Former owner  ",
      })
    ).toBe("historical-human-Former%20owner");
    expect(
      getHistoricalContextCardActorId({
        kind: "agent",
        displayNameSnapshot: "Release:bot",
      })
    ).toBe("historical-agent-Release%3Abot");
  });

  test("accepts well-formed actor references and rejects malformed ones", () => {
    expect(
      isContextCardActorReference({ kind: "human", id: "user-1" })
    ).toBe(true);
    expect(
      isContextCardActorReference({ kind: "agent", id: "cred-1" })
    ).toBe(true);
    expect(isContextCardActorReference(null)).toBe(false);
    expect(isContextCardActorReference(undefined)).toBe(false);
    expect(isContextCardActorReference({ kind: "robot", id: "x" })).toBe(
      false
    );
    expect(isContextCardActorReference({ kind: "human", id: "" })).toBe(false);
    expect(isContextCardActorReference({ kind: "human" })).toBe(false);
    expect(isContextCardActorReference("human:user-1")).toBe(false);
  });
});
