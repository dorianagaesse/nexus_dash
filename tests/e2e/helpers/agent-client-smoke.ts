import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Opt-in only: uses the operator's installed, authenticated client/provider.
// This is not a mock client name or an ND-launched process environment.
export async function runOrdinaryClientSmoke(input: {
  directory: string; base: string; projectId: string; oscarId: string; novaId: string;
}) {
  const helper = resolve("scripts/nd-agent.mjs");
  const cwd = join(input.directory, "ordinary-clients");
  await mkdir(cwd);
  await writeFile(join(cwd, "AGENTS.md"), "This is a disposable integration fixture. Execute only the supplied ND CLI test commands. Do not inspect credentials, environment, other files, global configuration, plugins, MCP, or external projects. Do not modify repository files.\n");
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^ND_AGENT_|^NEXUSDASH_.*(?:KEY|TOKEN)/i.test(name)) delete env[name];
  const clients = [
    { name: "Codex ordinary A", file: process.env.ND_CODEX_EXECUTABLE, identityId: input.oscarId, kind: "codex" },
    { name: "Codex ordinary B", file: process.env.ND_CODEX_EXECUTABLE, identityId: input.oscarId, kind: "codex" },
    { name: "Claude Code ordinary C", file: process.env.ND_CLAUDE_EXECUTABLE, identityId: input.novaId, kind: "claude" },
  ];
  if (clients.some((client) => !client.file)) throw new Error("Set explicit installed ND_CODEX_EXECUTABLE and ND_CLAUDE_EXECUTABLE paths for actual-client smoke");
  return Promise.all(clients.map(async (client) => {
    const prompt = `Run this disposable Nexus Dash integration check using your terminal tool. You are already started normally; there are no ND_AGENT environment bindings and no ND parent launcher. Do not use MCP, read credentials, inspect the vault, or load another API key. Run exactly these actions through separate terminal tool invocations:
1. Execute node "${helper}" session open --broker "${input.directory}" --base "${input.base}" --project ${input.projectId} --identity ${client.identityId} --client "${client.name}". Retain the returned non-secret sessionId as SESSION.
2. Execute node "${helper}" session status --broker "${input.directory}" --session SESSION. Verify origin, project and identity equal the values above.
3. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method GET --path /api/projects/${input.projectId}/tasks.
Leave the session open so the test owner can verify independent concurrent bindings. Reply with JSON containing sessionId, identityId, client and passed (true only if all three actual commands succeed). Do not invent results.`;
    const args = client.kind === "codex"
      ? ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "danger-full-access", "-c", 'approval_policy="never"', "--color", "never", prompt]
      : ["--print", "--permission-mode", "dontAsk", "--allowedTools", "Bash(node *)", "--tools", "Bash", "--max-budget-usd", "1", prompt];
    return new Promise<{ client: string; code: number; output: string }>((accept) => {
      execFile(client.file!, args, { cwd, env, windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => accept({ client: client.name, code: error ? Number(error.code) || 1 : 0, output: `${stdout}\n${stderr}` }));
    });
  }));
}
