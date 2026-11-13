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
    { name: "Claude Code ordinary D", file: process.env.ND_CLAUDE_EXECUTABLE, identityId: input.oscarId, kind: "claude" },
  ];
  if (clients.some((client) => !client.file)) throw new Error("Set explicit installed ND_CODEX_EXECUTABLE and ND_CLAUDE_EXECUTABLE paths for actual-client smoke");
  return Promise.all(clients.map(async (client, index) => {
    const taskFile = join(cwd, `task-${index}.json`);
    const editFile = join(cwd, `edit-${index}.json`);
    const commentFile = join(cwd, `comment-${index}.json`);
    const doneFile = join(cwd, `done-${index}.json`);
    await writeFile(taskFile, JSON.stringify({ title: `${client.name} contribution` }));
    await writeFile(editFile, JSON.stringify({ title: `${client.name} updated contribution` }));
    await writeFile(commentFile, JSON.stringify({ content: `${client.name} actual terminal check` }));
    await writeFile(doneFile, JSON.stringify({ status: "Done" }));
    const prompt = `Run this disposable Nexus Dash integration check using your terminal tool. You are already started normally; there are no ND_AGENT environment bindings and no ND parent launcher. Do not use MCP, read credentials, inspect the vault, or load another API key. Run exactly these actions through separate terminal tool invocations:
1. Execute node "${helper}" session open --broker "${input.directory}" --base "${input.base}" --project ${input.projectId} --identity ${client.identityId} --client "${client.name}". Retain the returned non-secret sessionId as SESSION.
2. Execute node "${helper}" session status --broker "${input.directory}" --session SESSION. Verify origin, project and identity equal the values above.
3. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method GET --path tasks. This project-relative path avoids Git Bash/MSYS rewriting /api arguments on Windows.
4. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method GET --path "tasks/search?q=contribution".
5. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method POST --path tasks --body-file "${taskFile}". Retain the created task.id as TASK. Its createdBy.id must match your bound identity.
6. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method PATCH --path tasks/TASK --body-file "${editFile}".
7. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method POST --path tasks/TASK/comments --body-file "${commentFile}".
8. Execute node "${helper}" session request --broker "${input.directory}" --session SESSION --method POST --path tasks/TASK/status --body-file "${doneFile}". ${client.identityId === input.novaId ? "Nova does not have Done permission, so this last call MUST fail with exit code 1 and a permission denial. That expected rejection counts as success." : "Oscar has Done permission, so this last call must succeed."}
Leave the session open so the test owner can verify independent concurrent bindings. Reply with JSON containing sessionId, identityId, client and passed (true only if all actual commands have their expected outcomes). Do not invent results.`;
    const args = client.kind === "codex"
      ? ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "danger-full-access", "-c", 'approval_policy="never"', "--color", "never", prompt]
      : ["--print", "--permission-mode", "dontAsk", "--allowedTools", "Bash(node *)", "--tools", "Bash", "--max-budget-usd", "1", prompt];
    return new Promise<{ client: string; code: number; output: string }>((accept) => {
      const child = execFile(client.file!, args, { cwd, env, windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => accept({ client: client.name, code: error ? Number(error.code) || 1 : 0, output: `${stdout}\n${stderr}` }));
      // Codex exec also reads redirected stdin; complete it before the prompt
      // can start. This does not supply any ND runtime environment or proof.
      child.stdin?.end();
    });
  }));
}
