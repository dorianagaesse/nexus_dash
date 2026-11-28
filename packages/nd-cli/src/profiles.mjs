import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveNdHome } from "./vault.mjs";

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export function resolveProfileName(explicitProfile) {
  const candidate = (explicitProfile ?? process.env.ND_PROFILE ?? "default").trim();
  if (!PROFILE_NAME_PATTERN.test(candidate)) {
    throw new Error(
      `Invalid profile name "${candidate}". Use 1-40 letters, digits, hyphens, or underscores.`
    );
  }
  return candidate;
}

export function normalizeBaseOrigin(rawBase) {
  const input = (rawBase ?? process.env.ND_BASE_URL ?? "https://nexus-dash.app").trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid NexusDash origin "${input}".`);
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    (parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)
      ))
  ) {
    throw new Error("Use an HTTPS origin (HTTP is allowed only for localhost)");
  }

  return parsed.origin;
}

export function reconnectCommand(profile) {
  return profile === "default" ? "nd login" : `nd login --profile ${profile}`;
}

function profilesDirectory(homeDir) {
  return join(resolveNdHome(homeDir), "cli", "profiles");
}

function profileFilePath(profile, homeDir) {
  return join(profilesDirectory(homeDir), `${resolveProfileName(profile)}.json`);
}

export function grantVaultKey(meta) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "nd-cli-grant:v1",
        meta.profile,
        meta.origin,
        meta.projectId,
        meta.identityId,
        meta.deviceId,
      ])
    )
    .digest("hex");
}

export function sessionVaultKey(meta) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "nd-cli-session:v1",
        meta.profile,
        meta.origin,
        meta.projectId,
        meta.identityId,
        meta.deviceId,
      ])
    )
    .digest("hex");
}

export async function readProfile(profile, options = {}) {
  const resolved = resolveProfileName(profile);
  let raw;
  try {
    raw = await readFile(profileFilePath(resolved, options.homeDir), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    parsed.version !== 1 ||
    parsed.profile !== resolved ||
    typeof parsed.origin !== "string" ||
    typeof parsed.projectId !== "string" ||
    typeof parsed.identityId !== "string" ||
    typeof parsed.deviceId !== "string"
  ) {
    throw new Error(
      `Profile "${resolved}" metadata is corrupted. Run "${reconnectCommand(resolved)} --replace" to reinitialize it.`
    );
  }
  return parsed;
}

export async function writeProfile(meta, options = {}) {
  const resolved = resolveProfileName(meta.profile);
  const directory = profilesDirectory(options.homeDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = profileFilePath(resolved, options.homeDir);
  const temp = `${target}.${process.pid}.next`;
  const record = {
    version: 1,
    profile: resolved,
    origin: normalizeBaseOrigin(meta.origin),
    projectId: meta.projectId,
    projectName: meta.projectName,
    identityId: meta.identityId,
    identityName: meta.identityName,
    descriptiveLabels: Array.isArray(meta.descriptiveLabels)
      ? meta.descriptiveLabels
      : [],
    deviceId: meta.deviceId,
    deviceName: meta.deviceName,
    scopes: Array.isArray(meta.scopes) ? meta.scopes : [],
    canMoveTasksToDone: Boolean(meta.canMoveTasksToDone),
    approvedAt: meta.approvedAt ?? new Date().toISOString(),
    deviceExpiresAt: meta.deviceExpiresAt,
  };
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
  return record;
}

export async function removeProfile(profile, options = {}) {
  const resolved = resolveProfileName(profile);
  await rm(profileFilePath(resolved, options.homeDir), { force: true });
}

export async function listProfiles(options = {}) {
  const directory = profilesDirectory(options.homeDir);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const name = entry.name.slice(0, -5);
    if (!PROFILE_NAME_PATTERN.test(name)) {
      continue;
    }
    const profile = await readProfile(name, options).catch(() => null);
    if (profile) {
      results.push(profile);
    }
  }
  return results.sort((left, right) => left.profile.localeCompare(right.profile));
}
