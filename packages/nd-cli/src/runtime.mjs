import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  grantVaultKey,
  normalizeBaseOrigin,
  readProfile,
  reconnectCommand,
  removeProfile,
  resolveProfileName,
  sessionVaultKey,
  writeProfile,
} from "./profiles.mjs";

const sha256Hex = (value) =>
  createHash("sha256").update(value).digest("hex");

export function buildProjectApiUrl(origin, projectId, relativeOrFullPath) {
  if (typeof relativeOrFullPath !== "string" || !relativeOrFullPath.trim()) {
    throw new Error("Invalid project API path");
  }
  const normalizedPath = relativeOrFullPath.startsWith("/")
    ? relativeOrFullPath
    : `/api/projects/${projectId}/${relativeOrFullPath}`;

  if (normalizedPath.startsWith("//") || normalizedPath.includes("\\")) {
    throw new Error("Invalid project API path");
  }

  const target = new URL(normalizedPath, origin);
  const expectedPrefix = `/api/projects/${projectId}`;
  if (
    target.origin !== new URL(origin).origin ||
    (target.pathname !== expectedPrefix &&
      !target.pathname.startsWith(`${expectedPrefix}/`)) ||
    /%2f|%5c|%2e/i.test(target.pathname)
  ) {
    throw new Error("Request is outside the bound project");
  }
  return target;
}

export function launchSystemBrowser(url) {
  return new Promise((resolve) => {
    const callback = () => resolve();
    if (process.platform === "win32") {
      execFile(
        "cmd.exe",
        ["/c", "start", "", url],
        { windowsHide: true },
        callback
      );
      return;
    }
    if (process.platform === "darwin") {
      execFile("open", [url], callback);
      return;
    }
    execFile("xdg-open", [url], callback);
  });
}

async function callJsonEndpoint(fetchImpl, url, body, timeoutMs = 15_000) {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { ok: response.ok, status: response.status, data: payload };
}

function buildReconnectMessage(profile, identityName, reason = "expired or was revoked") {
  const actor = identityName ? ` for "${identityName}"` : "";
  return `NexusDash authorization${actor} (profile "${profile}") ${reason}. Ask the operator to run "${reconnectCommand(profile)}" in their terminal to reconnect.`;
}

export async function loginWithBrowser(options) {
  const profile = resolveProfileName(options.profile);
  const origin = normalizeBaseOrigin(options.base);
  const vault = options.vault;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const existing = await readProfile(profile, { homeDir: options.homeDir });

  if (existing && existing.origin !== origin && !options.replace) {
    throw new Error(
      `Profile "${profile}" is already bound to ${existing.origin} (${existing.identityName}). Use "--profile <new-name>" for another workspace or pass "--replace" to rebind "${profile}".`
    );
  }

  const defaultName = `${hostname() || "workstation"} (nd)`.slice(0, 80);
  const deviceName = (options.deviceName?.trim() || existing?.deviceName || defaultName).slice(
    0,
    80
  );
  const requestedProjectId =
    options.projectId?.trim() ||
    (!options.replace ? existing?.projectId : undefined) ||
    undefined;
  const requestedIdentityId =
    options.identityId?.trim() ||
    (!options.replace ? existing?.identityId : undefined) ||
    undefined;

  // Private installation proof never leaves this machine during pairing.
  const installSecret = randomBytes(32).toString("base64url");
  const installSecretHash = sha256Hex(installSecret);

  const begin = await callJsonEndpoint(
    fetchImpl,
    new URL("/api/auth/agent/cli", origin),
    {
      operation: "begin",
      installSecretHash,
      deviceName,
      ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
      ...(requestedIdentityId ? { identityId: requestedIdentityId } : {}),
    }
  );

  if (!begin.ok) {
    throw new Error(
      `Could not start CLI pairing (${begin.data?.error ?? begin.status}). Verify ${origin} is reachable and retry.`
    );
  }

  const { requestId, userCode, pollSecret, authorizePath, expiresAt, intervalSeconds } =
    begin.data;
  const authorizeUrl = new URL(authorizePath, origin).toString();

  if (options.onPrompt) {
    options.onPrompt({
      profile,
      userCode,
      authorizeUrl,
      expiresAt,
      existingIdentityName: !options.replace ? existing?.identityName ?? null : null,
    });
  }

  const shouldOpenBrowser =
    options.openBrowser !== false && process.env.ND_NO_BROWSER !== "1";
  if (shouldOpenBrowser) {
    await launchSystemBrowser(authorizeUrl);
  }

  const pollDelayMs =
    options.pollIntervalMs ?? Math.max(500, (Number(intervalSeconds) || 2) * 1000);
  const deadlineMs = Math.min(
    Date.parse(expiresAt) || Date.now() + 600_000,
    Date.now() + (options.timeoutMs ?? 600_000)
  );

  while (Date.now() < deadlineMs) {
    await delay(pollDelayMs);
    const polled = await callJsonEndpoint(
      fetchImpl,
      new URL("/api/auth/agent/cli", origin),
      {
        operation: "poll",
        requestId,
        pollSecret,
      }
    );

    if (polled.ok && polled.data.status === "pending") {
      continue;
    }

    if (!polled.ok) {
      if (polled.status === 403 && polled.data?.error === "pairing-denied") {
        throw new Error("CLI pairing was declined in the browser. No credentials were saved.");
      }
      if (polled.status === 410) {
        throw new Error(
          `Confirmation code ${userCode} expired before browser approval. Run "${reconnectCommand(profile)}" again.`
        );
      }
      throw new Error(
        `CLI pairing failed (${polled.data?.error ?? polled.status}). Run "${reconnectCommand(profile)}" to retry.`
      );
    }

    if (polled.data.status === "approved") {
      const approved = polled.data;
      if (
        existing &&
        !options.replace &&
        (existing.identityId !== approved.identityId ||
          existing.projectId !== approved.projectId)
      ) {
        throw new Error(
          `Profile "${profile}" is already bound to "${existing.identityName}" (${existing.identityId}). Refusing to switch its actor to "${approved.identityName}" so concurrent executions keep their identity. Run "nd login --profile <new-name>" for "${approved.identityName}", or pass "--replace" after stopping clients using "${profile}".`
        );
      }

      const nextMeta = {
        profile,
        origin,
        projectId: approved.projectId,
        projectName: approved.projectName,
        identityId: approved.identityId,
        identityName: approved.identityName,
        descriptiveLabels: approved.descriptiveLabels ?? [],
        deviceId: approved.deviceId,
        deviceName: approved.deviceName,
        scopes: approved.scopes ?? [],
        canMoveTasksToDone: Boolean(approved.canMoveTasksToDone),
        approvedAt: new Date().toISOString(),
        deviceExpiresAt: approved.deviceExpiresAt,
      };

      await vault.write(grantVaultKey(nextMeta), installSecret);
      const saved = await writeProfile(nextMeta, { homeDir: options.homeDir });

      if (existing && existing.deviceId !== saved.deviceId) {
        await vault.remove(sessionVaultKey(existing));
        await vault.remove(grantVaultKey(existing));
      }

      return saved;
    }
  }

  throw new Error(
    `Timed out waiting for browser approval of code ${userCode}. Run "${reconnectCommand(profile)}" to try again.`
  );
}

async function readCachedSession(profileMeta, vault) {
  const raw = await vault.read(sessionVaultKey(profileMeta));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.sessionId === "string" &&
      typeof parsed?.sessionExpiresAt === "string" &&
      typeof parsed?.accessToken === "string" &&
      typeof parsed?.accessTokenExpiresAt === "string"
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed cache and clear below.
  }
  await vault.remove(sessionVaultKey(profileMeta));
  return null;
}

async function writeCachedSession(profileMeta, vault, runtimeTokenResponse) {
  const accessTokenExpiresAt = new Date(
    Date.now() + Math.max(1, Number(runtimeTokenResponse.expiresInSeconds) || 300) * 1000
  ).toISOString();
  const payload = JSON.stringify({
    sessionId: runtimeTokenResponse.sessionId,
    sessionExpiresAt: runtimeTokenResponse.sessionExpiresAt,
    accessToken: runtimeTokenResponse.accessToken,
    accessTokenExpiresAt,
  });
  await vault.write(sessionVaultKey(profileMeta), payload);
  return {
    sessionId: runtimeTokenResponse.sessionId,
    sessionExpiresAt: runtimeTokenResponse.sessionExpiresAt,
    accessToken: runtimeTokenResponse.accessToken,
    accessTokenExpiresAt,
  };
}

function assertRuntimeBindingMatches(profileMeta, responseData, expectedSessionId) {
  if (
    responseData.projectId !== profileMeta.projectId ||
    responseData.identityId !== profileMeta.identityId ||
    responseData.deviceId !== profileMeta.deviceId ||
    !responseData.sessionId ||
    (expectedSessionId && responseData.sessionId !== expectedSessionId)
  ) {
    throw new Error("Runtime identity binding mismatch; refusing fallback.");
  }
}

export async function ensureRuntimeBearer(options) {
  const { profileMeta, vault } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now();

  const proof = await vault.read(grantVaultKey(profileMeta));
  if (!proof) {
    throw new Error(
      `Installation credential missing from OS vault for "${profileMeta.identityName}" (profile "${profileMeta.profile}"). Ask the operator to run "${reconnectCommand(profileMeta.profile)}" in their terminal.`
    );
  }

  const cached = await readCachedSession(profileMeta, vault);
  const sessionStillWithinCeiling =
    cached && Date.parse(cached.sessionExpiresAt) > now + 5_000;

  if (
    !options.forceRenew &&
    sessionStillWithinCeiling &&
    Date.parse(cached.accessTokenExpiresAt) > now + 30_000
  ) {
    return {
      accessToken: cached.accessToken,
      sessionId: cached.sessionId,
      sessionExpiresAt: cached.sessionExpiresAt,
      liveStatus: null,
    };
  }

  const runtimeUrl = new URL("/api/auth/agent/runtime", profileMeta.origin);
  if (sessionStillWithinCeiling) {
    const renewed = await callJsonEndpoint(fetchImpl, runtimeUrl, {
      operation: "renew",
      projectId: profileMeta.projectId,
      identityId: profileMeta.identityId,
      proof,
      sessionId: cached.sessionId,
    });

    if (!renewed.ok) {
      if ([401, 403, 404].includes(renewed.status)) {
        await vault.remove(sessionVaultKey(profileMeta));
        const reason =
          renewed.data?.error === "runtime-permissions-empty"
            ? "has no remaining granted permissions"
            : "expired, ended, or was revoked";
        throw new Error(
          buildReconnectMessage(profileMeta.profile, profileMeta.identityName, reason)
        );
      }
      throw new Error(
        `Could not renew NexusDash session (${renewed.status}). Check network connectivity to ${profileMeta.origin}.`
      );
    }

    assertRuntimeBindingMatches(profileMeta, renewed.data, cached.sessionId);
    const saved = await writeCachedSession(profileMeta, vault, renewed.data);
    return { ...saved, liveStatus: renewed.data };
  }

  const started = await callJsonEndpoint(fetchImpl, runtimeUrl, {
    operation: "start",
    projectId: profileMeta.projectId,
    identityId: profileMeta.identityId,
    proof,
    client: `nd CLI (${profileMeta.profile})`.slice(0, 80),
  });

  if (!started.ok) {
    if ([401, 403, 404].includes(started.status)) {
      await vault.remove(sessionVaultKey(profileMeta));
      const reason =
        started.data?.error === "runtime-permissions-empty"
          ? "has no remaining granted permissions"
          : "expired or was revoked";
      throw new Error(
        buildReconnectMessage(profileMeta.profile, profileMeta.identityName, reason)
      );
    }
    throw new Error(
      `Could not open NexusDash session (${started.status}). Check network connectivity to ${profileMeta.origin}.`
    );
  }

  assertRuntimeBindingMatches(profileMeta, started.data);
  const saved = await writeCachedSession(profileMeta, vault, started.data);
  return { ...saved, liveStatus: started.data };
}

export async function projectApiRequest(options) {
  const profile = resolveProfileName(options.profile);
  const profileMeta = await readProfile(profile, { homeDir: options.homeDir });
  if (!profileMeta) {
    throw new Error(
      `No NexusDash identity is connected for profile "${profile}". Ask the operator to run "${reconnectCommand(profile)}" in their terminal.`
    );
  }

  const target = buildProjectApiUrl(
    profileMeta.origin,
    profileMeta.projectId,
    options.path
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const session = await ensureRuntimeBearer({
    profileMeta,
    vault: options.vault,
    fetchImpl,
    now: options.now,
  });

  const response = await fetchImpl(target, {
    method: options.method ?? "GET",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Unexpected redirect rejected for bound project API request");
  }

  let data = null;
  const rawText = await response.text();
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
  }

  if (response.status === 401) {
    await options.vault.remove(sessionVaultKey(profileMeta));
    throw new Error(
      buildReconnectMessage(
        profileMeta.profile,
        profileMeta.identityName,
        "expired, ended, or was revoked"
      )
    );
  }

  if (response.status === 403 && data?.error === "runtime-permissions-empty") {
    await options.vault.remove(sessionVaultKey(profileMeta));
    throw new Error(
      buildReconnectMessage(
        profileMeta.profile,
        profileMeta.identityName,
        "has no remaining granted permissions"
      )
    );
  }

  if (!response.ok) {
    const code = data?.error ?? `http-${response.status}`;
    if (response.status === 403) {
      throw new Error(
        `Permission denied (${code}) for identity "${profileMeta.identityName}". Check granted permissions in Project Settings -> Agent access.`
      );
    }
    throw new Error(`NexusDash API error (${response.status}): ${code}`);
  }

  return { status: response.status, data, profileMeta };
}

export async function logoutProfile(options) {
  const profile = resolveProfileName(options.profile);
  const profileMeta = await readProfile(profile, { homeDir: options.homeDir });
  if (!profileMeta) {
    return { removed: false, profile };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const proof = await options.vault.read(grantVaultKey(profileMeta));
  const cached = await readCachedSession(profileMeta, options.vault);
  if (proof && cached?.sessionId) {
    await callJsonEndpoint(
      fetchImpl,
      new URL("/api/auth/agent/runtime", profileMeta.origin),
      {
        operation: "end",
        projectId: profileMeta.projectId,
        identityId: profileMeta.identityId,
        proof,
        sessionId: cached.sessionId,
      }
    ).catch(() => {});
  }

  await options.vault.remove(sessionVaultKey(profileMeta));
  await options.vault.remove(grantVaultKey(profileMeta));
  await removeProfile(profile, { homeDir: options.homeDir });
  return { removed: true, profile, identityName: profileMeta.identityName };
}
