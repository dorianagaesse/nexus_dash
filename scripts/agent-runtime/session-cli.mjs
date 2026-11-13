import { readFile } from "node:fs/promises";
import { brokerCall, defaultBrokerDirectory, LocalBroker } from "./local-broker.mjs";

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
    response = await brokerCall(directory, vault, "/sessions", "POST", {
      binding: { base: options["--base"], projectId: options["--project"], identityId: options["--identity"] },
      client: options["--client"],
      ...(options["--lease-seconds"] ? { leaseSeconds: Number(options["--lease-seconds"]) } : {}),
    });
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
