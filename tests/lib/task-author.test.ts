import { describe, expect, test } from "vitest";

import {
  AGENT_TASK_AUTHOR_AVATAR_SEED,
  mapTaskAuthorRecord,
} from "@/lib/task-author";
import type { TaskPersonRecord } from "@/lib/task-person";

const ownerRecord: TaskPersonRecord = {
  id: "owner-1",
  name: "Owner Example",
  email: "owner@example.com",
  username: "owner",
  usernameDiscriminator: "1234",
  avatarSeed: null,
};

const ownerSummary = {
  id: "owner-1",
  displayName: "owner",
  usernameTag: "owner#1234",
  avatarSeed: "owner-1",
};

describe("mapTaskAuthorRecord", () => {
  test("maps a human author as a passthrough user summary", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: null,
      agentCredentialLabel: null,
    });

    expect(result).toEqual({
      ...ownerSummary,
      kind: "user",
      agentCredentialId: null,
      agentCredentialLabel: null,
      owner: null,
    });
  });

  test("maps an agent author from a credential id and label", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: "cred-1",
      agentCredentialLabel: "Release bot",
    });

    expect(result).toEqual({
      id: "cred-1",
      kind: "agent",
      displayName: "Release bot (agent)",
      usernameTag: null,
      avatarSeed: AGENT_TASK_AUTHOR_AVATAR_SEED,
      agentCredentialId: "cred-1",
      agentCredentialLabel: "Release bot",
      owner: ownerSummary,
    });
  });

  test("falls back to the owner identity when only a label marks an agent author", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: null,
      agentCredentialLabel: "Sprint helper",
    });

    expect(result).toEqual({
      id: "owner-1",
      kind: "agent",
      displayName: "Sprint helper (agent)",
      usernameTag: null,
      avatarSeed: AGENT_TASK_AUTHOR_AVATAR_SEED,
      agentCredentialId: null,
      agentCredentialLabel: "Sprint helper",
      owner: ownerSummary,
    });
  });

  test("uses a bare Agent display name for a credential without a label", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: "cred-2",
      agentCredentialLabel: "",
    });

    expect(result).toEqual({
      id: "cred-2",
      kind: "agent",
      displayName: "Agent",
      usernameTag: null,
      avatarSeed: AGENT_TASK_AUTHOR_AVATAR_SEED,
      agentCredentialId: "cred-2",
      agentCredentialLabel: null,
      owner: ownerSummary,
    });
  });

  test("trims whitespace from stored credential labels", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: "cred-3",
      agentCredentialLabel: "  Build bot  ",
    });

    expect(result.displayName).toBe("Build bot (agent)");
    expect(result.agentCredentialLabel).toBe("Build bot");
  });

  test("treats a whitespace-only label as a human author when no id is present", () => {
    const result = mapTaskAuthorRecord({
      author: ownerRecord,
      agentCredentialId: null,
      agentCredentialLabel: "   ",
    });

    expect(result).toEqual({
      ...ownerSummary,
      kind: "user",
      agentCredentialId: null,
      agentCredentialLabel: null,
      owner: null,
    });
  });

  test("keeps owner person mapping semantics for identity-less accounts", () => {
    const result = mapTaskAuthorRecord({
      author: {
        id: "minimal-1",
        name: null,
        email: null,
        username: null,
        usernameDiscriminator: null,
        avatarSeed: null,
      },
      agentCredentialId: null,
      agentCredentialLabel: null,
    });

    expect(result).toEqual({
      id: "minimal-1",
      kind: "user",
      displayName: "Account",
      usernameTag: null,
      avatarSeed: "minimal-1",
      agentCredentialId: null,
      agentCredentialLabel: null,
      owner: null,
    });
  });
});
