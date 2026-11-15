#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pairDevice, launchAgent } from "./agent-runtime/client.mjs";
import { createVault } from "./agent-runtime/vault.mjs";
import { sessionCommand } from "./agent-runtime/session-cli.mjs";

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === "broker" || operation === "session") {
    const [command, ...sessionArgs] = operation === "broker" ? ["broker", ...args] : args;
    await sessionCommand(command, sessionArgs, createVault());
    return;
  }
  if (operation === "request") {
    const [method, path, body] = args;
    const base = process.env.ND_AGENT_URL;
    const capability = process.env.ND_AGENT_CAPABILITY;
    if (
      !base ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) ||
      !capability ||
      !path?.startsWith("/")
    )
      throw new Error("No bound launcher session");
    const target = new URL(path, base);
    if (target.origin !== base) throw new Error("Invalid local request");
    const response = await fetch(target, {
      method,
      headers: {
        authorization: `Bearer ${capability}`,
        "Content-Type": "application/json",
      },
      body,
      redirect: "error",
    });
    process.stdout.write(await response.text());
    process.exitCode = response.ok ? 0 : 1;
    return;
  }
  const separator = args.indexOf("--");
  const flags = separator < 0 ? args : args.slice(0, separator);
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !["--base", "--project", "--identity"].includes(flags[i]) ||
      !flags[i + 1] ||
      options[flags[i]]
    )
      throw new Error("Invalid or duplicate binding option");
    options[flags[i]] = flags[i + 1];
  }
  const binding = {
    base: options["--base"] ?? "https://nexus-dash.app",
    projectId: options["--project"],
    identityId: options["--identity"],
  };
  if (operation === "login") {
    if (!process.stdin.isTTY)
      throw new Error("Run login yourself in an interactive terminal");
    process.stdout.write("One-time device pairing code: ");
    // Suppress terminal echo; the code never enters shell history or argv.
    const muted = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const prompt = createInterface({
      input: process.stdin,
      output: muted,
      terminal: true,
    });
    try {
      await pairDevice(
        binding,
        (await prompt.question("")).trim(),
        createVault()
      );
    } finally {
      prompt.close();
      process.stdout.write("\n");
    }
    console.log("Device paired. Runtime credential saved in the OS vault.");
  } else if (operation === "run" && separator >= 0 && args[separator + 1]) {
    process.exitCode = await launchAgent(
      binding,
      createVault(),
      args[separator + 1],
      args.slice(separator + 2)
    );
  } else
    throw new Error(
      "Usage: nd-agent.mjs broker [--broker DIRECTORY]\n" +
      "nd-agent.mjs session open --base ORIGIN --project ID --identity ID --client DESCRIPTION [--broker DIRECTORY] [--lease-seconds 60..3600]\n" +
      "nd-agent.mjs session status|close --session ID [--broker DIRECTORY]\n" +
      "nd-agent.mjs session request --session ID --method METHOD --path tasks [--body-file FILE] [--broker DIRECTORY]\n" +
      "nd-agent.mjs login|run --project ID --identity ID [--base ORIGIN] [-- executable args...]\nInside a launched client: nd-agent.mjs request METHOD /api/projects/PROJECT/... [JSON]"
    );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
