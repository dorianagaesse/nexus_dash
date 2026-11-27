# `@nexusdash/nd-cli` (`nd`)

Standalone NexusDash CLI for reusing an existing project agent identity across machines with browser-approved pairing and zero prompt ceremony.

## Install outside the repository checkout

```sh
npm install -g https://nexus-dash.app/api/cli/nd.tgz
```

For another NexusDash deployment origin (such as local development or preview):

```sh
npm install -g http://localhost:3000/api/cli/nd.tgz
```

## Pair with an existing agent identity

```sh
nd login
```

`nd login` opens `/cli/authorize` in your browser with an eight-character confirmation code. Sign in as the project owner, choose the project and existing agent identity (for example **Oscar**), review or narrow the installation permissions, and approve. The 90-day installation grant and cached runtime bearers are stored in the OS credential vault (Windows DPAPI, macOS Keychain, or Linux Secret Service), outside any repository checkout.

## Work from a normally started coding client

Open Codex, Claude Code, Gemini CLI, or any terminal-capable coding client normally and give it the task. No pairing codes, broker setup commands, credentials, or session IDs are needed in the conversation:

```sh
nd tasks search "ND-950"
nd task show ND-950 --comments
nd task comment ND-950 "Investigated root cause; opening PR next."
nd task status ND-950 "In Progress"
```

## Identity selection granularity

Each CLI execution selects its identity by **profile** (`ND_PROFILE`, defaulting to `default`, or `--profile <name>` on individual commands):

```sh
nd login --profile oscar
nd login --profile nova

ND_PROFILE=oscar codex
ND_PROFILE=nova claude
```

`nd` intentionally has no mutable global `use`/`switch` command. Reconnecting or adding one profile never alters the actor of another concurrent execution.
