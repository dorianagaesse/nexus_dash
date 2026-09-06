import {
  mapTaskPersonSummary,
  type TaskPersonRecord,
  type TaskPersonSummary,
} from "@/lib/task-person";

// Shared with task comments (TASK-307) so one agent keeps a single avatar
// treatment across every surface that renders an agent author.
export const AGENT_TASK_AUTHOR_AVATAR_SEED = "nexusdash-agent-comment-avatar";

export type TaskAuthorKind = "user" | "agent";

export interface TaskAuthorSummary extends TaskPersonSummary {
  kind: TaskAuthorKind;
  agentCredentialId: string | null;
  agentCredentialLabel: string | null;
  owner: TaskPersonSummary | null;
}

export function mapTaskAuthorRecord(input: {
  author: TaskPersonRecord;
  agentCredentialId: string | null;
  agentCredentialLabel: string | null;
}): TaskAuthorSummary {
  const owner = mapTaskPersonSummary(input.author)!;
  const agentCredentialLabel = input.agentCredentialLabel?.trim() ?? "";
  const isAgentAuthor = Boolean(
    input.agentCredentialId || agentCredentialLabel
  );

  return isAgentAuthor
    ? {
        id: input.agentCredentialId ?? owner.id,
        kind: "agent",
        displayName: agentCredentialLabel
          ? `${agentCredentialLabel} (agent)`
          : "Agent",
        usernameTag: null,
        avatarSeed: AGENT_TASK_AUTHOR_AVATAR_SEED,
        agentCredentialId: input.agentCredentialId,
        agentCredentialLabel: agentCredentialLabel || null,
        owner,
      }
    : {
        ...owner,
        kind: "user",
        agentCredentialId: null,
        agentCredentialLabel: null,
        owner: null,
      };
}
