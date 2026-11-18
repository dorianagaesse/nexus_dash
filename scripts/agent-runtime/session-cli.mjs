import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { bindingKey } from "./client.mjs";
import { brokerCall, defaultBrokerDirectory, LocalBroker, readBrokerEndpoint } from "./local-broker.mjs";

const helper = fileURLToPath(new URL("../nd-agent.mjs", import.meta.url));

async function ensureBroker(directory) {
  try {
    await readBrokerEndpoint(directory);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const env = { ...process.env };
  delete env.ND_AGENT_URL;
  delete env.ND_AGENT_CAPABILITY;
  const child = spawn(process.execPath, [helper, "broker", "--broker", resolve(directory)], {
    detached: true, windowsHide: true, stdio: "ignore", env,
  });
  let spawnError;
  child.once("error", (error) => { spawnError = error; });
  child.unref();

  // A concurrent open can win the broker lock. Either caller may use the
  // one published endpoint, but neither may retry a session creation.
  const deadline = performance.now() + 15_000;
  do {
    try {
      await readBrokerEndpoint(directory);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (spawnError) throw new Error("Could not launch the local Nexus Dash broker", { cause: spawnError });
    await delay(100);
  } while (performance.now() < deadline);
  throw new Error("Local Nexus Dash broker did not become ready. Run nd-agent.mjs broker in a terminal to diagnose startup.");
}

// Session references are deliberately explicit on every invocation. No cwd,
// profile, conversation guess, global current identity or inherited ND binding.
export async function sessionCommand(operation, args, vault) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--broker", "--base", "--project", "--identity", "--client", "--lease-seconds", "--session", "--method", "--path", "--body-file"].includes(args[i]) ||
      !args[i + 1] || options[args[i]]) throw new Error("Invalid or duplicate session option");
    options[args[i]] = args[i + 1];
  }
  const directory = options["--broker"] ?? defaultBrokerDirectory();
  if (operation === "broker") {
    if (Object.keys(options).some((key) => key !== "--broker")) throw new Error("Broker accepts only --broker DIRECTORY");
    const broker = await new LocalBroker(directory, vault).start();
    const stop = () => { void broker.close().catch(() => { process.exitCode = 1; }); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    console.log("Nexus Dash broker ready. Start a session from your existing client with session open.");
    return;
  }
  const permitted = operation === "open"
    ? ["--broker", "--base", "--project", "--identity", "--client", "--lease-seconds"]
    : operation === "request"
      ? ["--broker", "--session", "--method", "--path", "--body-file"]
      : ["--broker", "--session"];
  if (Object.keys(options).some((key) => !permitted.includes(key))) throw new Error("Option does not apply to this session command");
  let response;
  if (operation === "open") {
    if (!options["--base"] || !options["--project"] || !options["--identity"] || !options["--client"])
      throw new Error("Session open requires explicit --base ORIGIN --project ID --identity ID --client DESCRIPTION");
    const binding = { base: options["--base"], projectId: options["--project"], identityId: options["--identity"] };
    bindingKey(binding);
    const client = options["--client"];
    if (!client.trim() || client.length > 80) throw new Error("Explicit client/execution description required");
    const lease = options["--lease-seconds"];
    const leaseSeconds = lease === undefined ? undefined : Number(lease);
    if (lease !== undefined && (!/^\d+$/.test(lease) || leaseSeconds < 60 || leaseSeconds > 3600))
      throw new Error("Idle lease must be 60 to 3600 seconds");
    await ensureBroker(directory);
    response = await brokerCall(directory, vault, "/sessions", "POST", { binding, client, leaseSeconds });
  } else {
    const session = options["--session"];
    if (!/^[\w-]{1,128}$/.test(session ?? "")) throw new Error("Explicit --session ID required");
    if (operation === "status" || operation === "close") {
      response = await brokerCall(directory, vault, `/sessions/${session}`, operation === "close" ? "DELETE" : "GET");
    } else if (operation === "request") {
      if (!options["--method"] || !options["--path"]) throw new Error("Request requires --method METHOD --path tasks (or a full bound project API path)");
      response = await brokerCall(directory, vault, `/sessions/${session}/request`, "POST", {
        method: options["--method"], path: options["--path"],
        ...(options["--body-file"] ? { body: await readFile(options["--body-file"], "utf8") } : {}),
      });
    } else throw new Error("Use session open|status|request|close");
  }
  process.stdout.write(`${await response.text()}\n`);
  process.exitCode = response.ok ? 0 : 1;
}
