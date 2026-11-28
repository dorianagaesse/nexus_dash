import { readFile } from "node:fs/promises";
import { createCliVault } from "./vault.mjs";
import { listProfiles, readProfile, resolveProfileName } from "./profiles.mjs";
import {
  ensureRuntimeBearer,
  loginWithBrowser,
  logoutProfile,
  projectApiRequest,
} from "./runtime.mjs";

const MAIN_HELP = `nd - Standalone NexusDash CLI

Operator setup:
  nd login [--base ORIGIN] [--profile NAME] [--name DEVICE] [--project ID] [--identity ID] [--replace] [--no-browser]
  nd status [--profile NAME] [--json]
  nd profiles [--json]
  nd logout [--profile NAME]

Task commands (run from any coding client):
  nd tasks search <query> [--limit N] [--json] [--profile NAME]
  nd tasks list [--status LANE] [--assignee self|unassigned] [--label LABEL] [--epic ID] [--limit N] [--json] [--profile NAME]
  nd task show <ND-123|taskId> [--comments] [--json] [--profile NAME]
  nd task comment <ND-123|taskId> <message | --body-file FILE> [--json] [--profile NAME]
  nd task comments <ND-123|taskId> [--json] [--profile NAME]
  nd task status <ND-123|taskId> <Backlog|"In Progress"|Blocked|Done> [--blocked-note TEXT] [--json] [--profile NAME]
  nd task create --title TITLE [--description TEXT | --description-file FILE] [--label LABEL] [--epic ID] [--json] [--profile NAME]
  nd task update <ND-123|taskId> [--title TITLE] [--description TEXT | --description-file FILE] [--label LABEL] [--json] [--profile NAME]

Identity selection granularity:
  Each execution resolves ND_PROFILE (default "default") or --profile NAME.
  There is no mutable global switch command, so changing one profile never changes another execution's actor.
`;

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseFlags(args, spec) {
  const booleans = new Set(spec.booleans ?? []);
  const strings = new Set(spec.strings ?? []);
  const flags = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (token === "-h" || token === "--help") {
      flags.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const name = token.slice(2);
      if (booleans.has(name)) {
        flags[name] = true;
        continue;
      }
      if (strings.has(name)) {
        const value = args[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${name} requires a value`);
        }
        if (flags[name] !== undefined) {
          throw new Error(`Duplicate option --${name}`);
        }
        flags[name] = value;
        index += 1;
        continue;
      }
      throw new Error(`Unknown option: ${token}`);
    }
    positionals.push(token);
  }

  return { flags, positionals };
}

async function resolveTaskIdentifier(identifier, requestFn) {
  const trimmed = String(identifier ?? "").trim();
  if (!trimmed) {
    throw new Error("Task reference (for example ND-950) or task ID is required");
  }
  if (!/^ND-\d+$/i.test(trimmed)) {
    return trimmed;
  }

  const upperRef = trimmed.toUpperCase();
  const searched = await requestFn({
    method: "GET",
    path: `tasks/search?q=${encodeURIComponent(upperRef)}&limit=25`,
  });
  const candidateIds = Array.isArray(searched.data?.taskIds)
    ? searched.data.taskIds
    : [];

  for (const candidateId of candidateIds) {
    const detail = await requestFn({ method: "GET", path: `tasks/${candidateId}` });
    const task = detail.data?.task;
    if (task && String(task.reference ?? "").toUpperCase() === upperRef) {
      return task.id;
    }
  }

  throw new Error(`Task "${upperRef}" was not found in the bound project`);
}

function formatTaskSummaryLine(task) {
  const ref = task.reference ?? task.id;
  const assignee = task.assignee?.displayName
    ? ` · assignee: ${task.assignee.displayName}`
    : "";
  return `${ref}  [${task.status}]  ${task.title}  (id: ${task.id}${assignee})`;
}

export async function runCli(argv, dependencies = {}) {
  const writeOut =
    dependencies.stdout ?? ((text) => process.stdout.write(`${text}\n`));
  const vault =
    dependencies.vault ?? createCliVault({ homeDir: dependencies.homeDir });
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;

  if (!argv.length || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    writeOut(MAIN_HELP.trimEnd());
    return 0;
  }

  const [topCommand, ...rest] = argv;

  if (topCommand === "login") {
    const { flags, positionals } = parseFlags(rest, {
      booleans: ["replace", "no-browser", "json"],
      strings: ["base", "profile", "name", "project", "identity"],
    });
    if (flags.help) {
      writeOut(
        "Usage: nd login [--base ORIGIN] [--profile NAME] [--name DEVICE] [--project ID] [--identity ID] [--replace] [--no-browser] [--json]"
      );
      return 0;
    }
    if (positionals.length) {
      throw new Error(`Unexpected argument "${positionals[0]}" for nd login`);
    }

    const saved = await loginWithBrowser({
      base: flags.base,
      profile: flags.profile,
      deviceName: flags.name,
      projectId: flags.project,
      identityId: flags.identity,
      replace: Boolean(flags.replace),
      openBrowser: !flags["no-browser"],
      vault,
      fetchImpl,
      homeDir: dependencies.homeDir,
      pollIntervalMs: dependencies.pollIntervalMs,
      timeoutMs: dependencies.timeoutMs,
      onPrompt: ({ profile, userCode, authorizeUrl, existingIdentityName }) => {
        if (!flags.json) {
          if (existingIdentityName) {
            writeOut(
              `Reconnecting profile "${profile}" for identity "${existingIdentityName}"...`
            );
          }
          writeOut(`Confirmation code: ${userCode}`);
          writeOut(`Approve in browser: ${authorizeUrl}`);
          writeOut("Waiting for browser approval...");
        }
      },
    });

    if (flags.json) {
      writeOut(JSON.stringify(saved, null, 2));
    } else {
      writeOut(
        `Connected profile "${saved.profile}" to identity "${saved.identityName}" (${saved.identityId}) in project "${saved.projectName}". Credential stored in OS vault.`
      );
    }
    return 0;
  }

  if (topCommand === "status" || topCommand === "whoami") {
    const { flags, positionals } = parseFlags(rest, {
      booleans: ["json"],
      strings: ["profile"],
    });
    if (flags.help) {
      writeOut("Usage: nd status [--profile NAME] [--json]");
      return 0;
    }
    if (positionals.length) {
      throw new Error(`Unexpected argument "${positionals[0]}"`);
    }

    const profile = resolveProfileName(flags.profile);
    const profileMeta = await readProfile(profile, {
      homeDir: dependencies.homeDir,
    });
    if (!profileMeta) {
      throw new Error(
        `No NexusDash identity is connected for profile "${profile}". Run "${profile === "default" ? "nd login" : `nd login --profile ${profile}`}" in your terminal.`
      );
    }

    const session = await ensureRuntimeBearer({
      profileMeta,
      vault,
      fetchImpl,
      forceRenew: true,
    });
    const live = session.liveStatus;
    const summary = {
      profile: profileMeta.profile,
      origin: profileMeta.origin,
      projectId: profileMeta.projectId,
      projectName: profileMeta.projectName,
      identityId: profileMeta.identityId,
      identityName: live?.identityName ?? profileMeta.identityName,
      descriptiveLabels:
        live?.descriptiveLabels ?? profileMeta.descriptiveLabels ?? [],
      deviceId: profileMeta.deviceId,
      deviceName: profileMeta.deviceName,
      scopes: live?.scopes ?? profileMeta.scopes,
      canMoveTasksToDone:
        live?.canMoveTasksToDone ?? profileMeta.canMoveTasksToDone,
      sessionExpiresAt: session.sessionExpiresAt,
      deviceExpiresAt: live?.deviceExpiresAt ?? profileMeta.deviceExpiresAt,
    };

    if (flags.json) {
      writeOut(JSON.stringify(summary, null, 2));
    } else {
      writeOut(
        `Profile: ${summary.profile}\nProject: ${summary.projectName} (${summary.projectId})\nIdentity: ${summary.identityName} (${summary.identityId})\nInstallation: ${summary.deviceName} (${summary.deviceId})\nPermissions: ${summary.scopes.join(", ")}\nMove tasks to Done: ${summary.canMoveTasksToDone ? "allowed" : "not allowed"}`
      );
    }
    return 0;
  }

  if (topCommand === "profiles") {
    const { flags } = parseFlags(rest, { booleans: ["json"] });
    if (flags.help) {
      writeOut("Usage: nd profiles [--json]");
      return 0;
    }
    const activeName = resolveProfileName(undefined);
    const profiles = await listProfiles({ homeDir: dependencies.homeDir });
    if (flags.json) {
      writeOut(JSON.stringify({ selectedProfile: activeName, profiles }, null, 2));
      return 0;
    }
    if (!profiles.length) {
      writeOut('No CLI profiles configured. Run "nd login" in your terminal.');
      return 0;
    }
    for (const item of profiles) {
      const marker = item.profile === activeName ? "*" : " ";
      writeOut(
        `${marker} ${item.profile}  ${item.identityName} (${item.identityId})  project: ${item.projectName}  installation: ${item.deviceName}`
      );
    }
    return 0;
  }

  if (topCommand === "logout") {
    const { flags } = parseFlags(rest, { booleans: ["json"], strings: ["profile"] });
    if (flags.help) {
      writeOut("Usage: nd logout [--profile NAME] [--json]");
      return 0;
    }
    const outcome = await logoutProfile({
      profile: flags.profile,
      vault,
      fetchImpl,
      homeDir: dependencies.homeDir,
    });
    if (flags.json) {
      writeOut(JSON.stringify(outcome, null, 2));
    } else if (outcome.removed) {
      writeOut(
        `Disconnected profile "${outcome.profile}" (${outcome.identityName}) and cleared OS vault credentials.`
      );
    } else {
      writeOut(`Profile "${outcome.profile}" was not connected.`);
    }
    return 0;
  }

  if (topCommand === "task" || topCommand === "tasks") {
    const [subcommand, ...subArgs] = rest;
    if (!subcommand || subcommand === "--help" || subcommand === "-h") {
      writeOut(
        `Usage:
  nd tasks search <query> [--limit N] [--json] [--profile NAME]
  nd tasks list [--status LANE] [--assignee self|unassigned] [--label LABEL] [--epic ID] [--limit N] [--json] [--profile NAME]
  nd task show <ND-123|taskId> [--comments] [--json] [--profile NAME]
  nd task comment <ND-123|taskId> <message | --body-file FILE> [--json] [--profile NAME]
  nd task comments <ND-123|taskId> [--json] [--profile NAME]
  nd task status <ND-123|taskId> <Backlog|"In Progress"|Blocked|Done> [--blocked-note TEXT] [--json] [--profile NAME]
  nd task create --title TITLE [--description TEXT | --description-file FILE] [--label LABEL] [--epic ID] [--json] [--profile NAME]
  nd task update <ND-123|taskId> [--title TITLE] [--description TEXT | --description-file FILE] [--label LABEL] [--json] [--profile NAME]`
      );
      return 0;
    }

    const callApi = (profile) => (req) =>
      projectApiRequest({
        ...req,
        profile,
        vault,
        fetchImpl,
        homeDir: dependencies.homeDir,
      });

    if (subcommand === "search") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["limit", "profile"],
      });
      if (flags.help) {
        writeOut("Usage: nd tasks search <query> [--limit N] [--json] [--profile NAME]");
        return 0;
      }
      const query = positionals.join(" ").trim();
      if (!query) {
        throw new Error("Search query is required: nd tasks search <query>");
      }
      const limit = flags.limit ? Number.parseInt(flags.limit, 10) : 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new Error("--limit must be an integer between 1 and 200");
      }

      const request = callApi(flags.profile);
      const searchResult = await request({
        method: "GET",
        path: `tasks/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      });
      const taskIds = Array.isArray(searchResult.data?.taskIds)
        ? searchResult.data.taskIds
        : [];

      const tasks = [];
      if (taskIds.length > 0) {
        const board = await request({ method: "GET", path: "tasks" });
        const byId = new Map(
          (board.data?.tasks ?? []).map((entry) => [entry.id, entry])
        );
        for (const id of taskIds) {
          if (byId.has(id)) {
            tasks.push(byId.get(id));
          } else {
            const detail = await request({
              method: "GET",
              path: `tasks/${id}`,
            }).catch(() => null);
            if (detail?.data?.task) {
              tasks.push(detail.data.task);
            }
          }
        }
      }

      const summaryTasks = tasks.map((task) => ({
        id: task.id,
        reference: task.reference ?? null,
        title: task.title,
        status: task.status,
        labels: task.labels ?? [],
        assignee: task.assignee
          ? {
              id: task.assignee.id,
              kind: task.assignee.kind,
              displayName: task.assignee.displayName,
            }
          : null,
      }));

      if (flags.json) {
        writeOut(
          JSON.stringify(
            {
              query,
              totalMatches: searchResult.data?.totalMatches ?? summaryTasks.length,
              truncated: Boolean(searchResult.data?.truncated),
              tasks: summaryTasks,
            },
            null,
            2
          )
        );
        return 0;
      }

      if (!summaryTasks.length) {
        writeOut(`No tasks matched "${query}".`);
        return 0;
      }
      for (const task of summaryTasks) {
        writeOut(formatTaskSummaryLine(task));
      }
      return 0;
    }

    if (subcommand === "list") {
      const { flags } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["status", "assignee", "label", "epic", "limit", "profile"],
      });
      if (flags.help) {
        writeOut(
          "Usage: nd tasks list [--status LANE] [--assignee self|unassigned] [--label LABEL] [--epic ID] [--limit N] [--json] [--profile NAME]"
        );
        return 0;
      }
      const params = new URLSearchParams();
      if (flags.assignee) params.set("assignee", flags.assignee);
      if (flags.label) params.set("label", flags.label);
      if (flags.epic) params.set("epicId", flags.epic);
      if (flags.limit) params.set("limit", flags.limit);
      const queryString = params.toString();

      const request = callApi(flags.profile);
      const result = await request({
        method: "GET",
        path: queryString ? `tasks?${queryString}` : "tasks",
      });
      let tasks = result.data?.tasks ?? [];
      if (flags.status) {
        const needle = flags.status.trim().toLowerCase();
        tasks = tasks.filter(
          (entry) => String(entry.status ?? "").toLowerCase() === needle
        );
      }

      if (flags.json) {
        writeOut(JSON.stringify({ tasks }, null, 2));
        return 0;
      }
      if (!tasks.length) {
        writeOut("No matching tasks.");
        return 0;
      }
      for (const task of tasks) {
        writeOut(formatTaskSummaryLine(task));
      }
      return 0;
    }

    if (subcommand === "show" || subcommand === "get") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["comments", "json"],
        strings: ["profile"],
      });
      if (flags.help) {
        writeOut("Usage: nd task show <ND-123|taskId> [--comments] [--json] [--profile NAME]");
        return 0;
      }
      const request = callApi(flags.profile);
      const taskId = await resolveTaskIdentifier(positionals[0], request);
      const detail = await request({ method: "GET", path: `tasks/${taskId}` });
      const task = detail.data?.task;
      const comments = flags.comments
        ? (
            await request({
              method: "GET",
              path: `tasks/${taskId}/comments`,
            })
          ).data?.comments ?? []
        : undefined;

      if (flags.json) {
        writeOut(
          JSON.stringify(
            comments ? { task, comments } : { task },
            null,
            2
          )
        );
        return 0;
      }

      writeOut(`${task.reference ?? task.id}: ${task.title}`);
      writeOut(`ID: ${task.id} · Status: ${task.status} · Labels: ${(task.labels ?? []).join(", ") || "none"}`);
      if (task.description) {
        writeOut(`\n${task.description}`);
      }
      if (comments) {
        writeOut(`\nComments (${comments.length}):`);
        for (const entry of comments) {
          writeOut(
            `- [${entry.createdAt}] ${entry.author?.displayName ?? "Unknown"} (${entry.author?.kind ?? "unknown"}): ${stripHtml(entry.content)}`
          );
        }
      }
      return 0;
    }

    if (subcommand === "comments") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["profile"],
      });
      if (flags.help) {
        writeOut("Usage: nd task comments <ND-123|taskId> [--json] [--profile NAME]");
        return 0;
      }
      const request = callApi(flags.profile);
      const taskId = await resolveTaskIdentifier(positionals[0], request);
      const response = await request({
        method: "GET",
        path: `tasks/${taskId}/comments`,
      });
      const comments = response.data?.comments ?? [];
      if (flags.json) {
        writeOut(JSON.stringify({ comments }, null, 2));
        return 0;
      }
      if (!comments.length) {
        writeOut("No comments on this task.");
        return 0;
      }
      for (const entry of comments) {
        writeOut(
          `[${entry.createdAt}] ${entry.author?.displayName ?? "Unknown"} (${entry.author?.id ?? ""}): ${stripHtml(entry.content)}`
        );
      }
      return 0;
    }

    if (subcommand === "comment") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["body-file", "profile"],
      });
      if (flags.help) {
        writeOut(
          "Usage: nd task comment <ND-123|taskId> <message | --body-file FILE> [--json] [--profile NAME]"
        );
        return 0;
      }
      const [targetRef, ...messageParts] = positionals;
      const content = flags["body-file"]
        ? (await readFile(flags["body-file"], "utf8")).trim()
        : messageParts.join(" ").trim();
      if (!content) {
        throw new Error("Comment text is required (pass inline text or --body-file FILE)");
      }

      const request = callApi(flags.profile);
      const taskId = await resolveTaskIdentifier(targetRef, request);
      const created = await request({
        method: "POST",
        path: `tasks/${taskId}/comments`,
        body: { content },
      });
      const comment = created.data?.comment;
      if (flags.json) {
        writeOut(JSON.stringify({ taskId, comment }, null, 2));
      } else {
        writeOut(
          `Comment ${comment.id} added to task ${taskId} as ${comment.author?.displayName ?? created.profileMeta.identityName} (${comment.author?.id ?? created.profileMeta.identityId}).`
        );
      }
      return 0;
    }

    if (subcommand === "status") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["blocked-note", "profile"],
      });
      if (flags.help) {
        writeOut(
          'Usage: nd task status <ND-123|taskId> <Backlog|"In Progress"|Blocked|Done> [--blocked-note TEXT] [--json] [--profile NAME]'
        );
        return 0;
      }
      const [targetRef, ...statusParts] = positionals;
      const nextStatus = statusParts.join(" ").trim();
      if (!nextStatus) {
        throw new Error("Target status is required (Backlog, In Progress, Blocked, or Done)");
      }
      const request = callApi(flags.profile);
      const taskId = await resolveTaskIdentifier(targetRef, request);
      const moved = await request({
        method: "POST",
        path: `tasks/${taskId}/status`,
        body: {
          status: nextStatus,
          ...(flags["blocked-note"] ? { blockedNote: flags["blocked-note"] } : {}),
        },
      });
      const task = moved.data?.task;
      if (flags.json) {
        writeOut(JSON.stringify({ task }, null, 2));
      } else {
        writeOut(`Moved ${task.reference ?? task.id} to ${task.status}.`);
      }
      return 0;
    }

    if (subcommand === "create") {
      const { flags } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["title", "description", "description-file", "label", "epic", "profile"],
      });
      if (flags.help) {
        writeOut(
          "Usage: nd task create --title TITLE [--description TEXT | --description-file FILE] [--label LABEL] [--epic ID] [--json] [--profile NAME]"
        );
        return 0;
      }
      if (!flags.title?.trim()) {
        throw new Error("--title is required to create a task");
      }
      const description = flags["description-file"]
        ? await readFile(flags["description-file"], "utf8")
        : flags.description;
      const request = callApi(flags.profile);
      const created = await request({
        method: "POST",
        path: "tasks",
        body: {
          title: flags.title.trim(),
          ...(description !== undefined ? { description } : {}),
          ...(flags.label ? { labels: [flags.label] } : {}),
          ...(flags.epic ? { epicId: flags.epic } : {}),
        },
      });
      const task = created.data?.task;
      if (flags.json) {
        writeOut(JSON.stringify({ task }, null, 2));
      } else {
        writeOut(formatTaskSummaryLine(task));
      }
      return 0;
    }

    if (subcommand === "update") {
      const { flags, positionals } = parseFlags(subArgs, {
        booleans: ["json"],
        strings: ["title", "description", "description-file", "label", "profile"],
      });
      if (flags.help) {
        writeOut(
          "Usage: nd task update <ND-123|taskId> [--title TITLE] [--description TEXT | --description-file FILE] [--label LABEL] [--json] [--profile NAME]"
        );
        return 0;
      }
      const description = flags["description-file"]
        ? await readFile(flags["description-file"], "utf8")
        : flags.description;
      const changes = {
        ...(flags.title !== undefined ? { title: flags.title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(flags.label !== undefined ? { labels: [flags.label] } : {}),
      };
      if (!Object.keys(changes).length) {
        throw new Error("Provide at least one field to update (--title, --description, or --label)");
      }
      const request = callApi(flags.profile);
      const taskId = await resolveTaskIdentifier(positionals[0], request);
      const updated = await request({
        method: "PATCH",
        path: `tasks/${taskId}`,
        body: changes,
      });
      const task = updated.data?.task;
      if (flags.json) {
        writeOut(JSON.stringify({ task }, null, 2));
      } else {
        writeOut(formatTaskSummaryLine(task));
      }
      return 0;
    }

    throw new Error(`Unknown task subcommand "${subcommand}". Run "nd tasks --help".`);
  }

  throw new Error(`Unknown command "${topCommand}". Run "nd --help".`);
}
