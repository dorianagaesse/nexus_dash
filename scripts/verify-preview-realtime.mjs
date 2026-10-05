import assert from "node:assert/strict";
import crypto from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import WebSocket from "ws";

const baseUrl = process.env.PREVIEW_AUTH_ORIGIN;
const databaseUrl = process.env.MIGRATION_DATABASE_URL;
assert(baseUrl?.startsWith("https://"), "PREVIEW_AUTH_ORIGIN is required");
assert(databaseUrl, "MIGRATION_DATABASE_URL is required");

const connectionUrl = new URL(databaseUrl);
if (
  connectionUrl.searchParams.get("sslmode")?.toLowerCase() === "require" &&
  !connectionUrl.searchParams.has("uselibpqcompat")
) {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
}
const pool = new pg.Pool({ connectionString: connectionUrl.toString() });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: true }),
});
const clients = [];
const userIds = [];
let browser;

async function deadline(promise, label, ms = 20_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fixtureUser(label) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `nd373-${label}-${nonce}@nexusdash.local`,
      name: `ND-373 ${label}`,
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  userIds.push(user.id);
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: crypto
        .createHash("sha256")
        .update(sessionToken)
        .digest("base64url"),
      expires: new Date(Date.now() + 30 * 60_000),
    },
  });
  return { id: user.id, sessionToken };
}

async function tokenFor(user) {
  const response = await fetch(`${baseUrl}/api/realtime/token`, {
    method: "POST",
    headers: {
      Cookie: `nexusdash.session-token=${user.sessionToken}`,
    },
  });
  assert.equal(response.status, 200, "authenticated token request failed");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const token = await response.json();
  assert(token.token && token.supabaseUrl && token.supabasePublishableKey);
  return token;
}

async function clientFor(token) {
  const client = createClient(token.supabaseUrl, token.supabasePublishableKey, {
    accessToken: async () => token.token,
    realtime: { transport: WebSocket },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  clients.push(client);
  await client.realtime.setAuth();
  return client;
}

function subscribe(client, topic, event, onPayload, privateChannel = true) {
  const channel = client.channel(topic, {
    config: { private: privateChannel, broadcast: { ack: true } },
  });
  if (onPayload) {
    channel.on("broadcast", { event }, ({ payload }) => onPayload(payload));
  }
  const result = deadline(
    new Promise((resolve) => {
      channel.subscribe((status, error) => {
        const result = {
          allowed: status === "SUBSCRIBED",
          status,
          reason: error?.message ?? String(error ?? ""),
        };
        if (status === "SUBSCRIBED") resolve(result);
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          resolve(result);
        }
      });
    }),
    `Realtime join for ${topic}`
  );
  return { channel, result };
}

async function browserContextFor(user) {
  const context = await browser.newContext();
  await context.addCookies([{
    name: "nexusdash.session-token",
    value: user.sessionToken,
    url: baseUrl,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
  return context;
}

async function renameProject(page, projectId, name) {
  const response = await page.request.patch(`${baseUrl}/api/projects/${projectId}`, {
    data: { name },
  });
  assert.equal(response.status(), 200, `project rename failed (${response.status()})`);
}

async function waitForProjectName(page, name) {
  await page.getByRole("heading", { name, exact: true }).waitFor({ timeout: 25_000 });
}

function isStreamRequest(request) {
  return /\/(?:activity|notifications)\/stream$/.test(new URL(request.url()).pathname);
}

function isActivityPoll(request, projectId) {
  return new URL(request.url()).pathname === `/api/projects/${projectId}/activity` &&
    request.headers()["x-realtime-reconcile"] !== "1";
}

try {
  const anonymous = await fetch(`${baseUrl}/api/realtime/token`, {
    method: "POST",
  });
  assert.equal(anonymous.status, 401);

  const owner = await fixtureUser("owner");
  const member = await fixtureUser("member");
  const outsider = await fixtureUser("outsider");
  const project = await prisma.project.create({
    data: {
      name: "ND-373 Preview Broadcast smoke",
      ownerId: owner.id,
      memberships: {
        create: [
          { userId: owner.id, role: "owner" },
          { userId: member.id, role: "viewer" },
        ],
      },
    },
    select: { id: true },
  });

  const projectTopic = `project:${project.id}:activity`;
  const notificationTopic = `user:${member.id}:notifications`;
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    await dbClient.query("SET LOCAL ROLE authenticated");
    await dbClient.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: member.id, role: "authenticated" }),
    ]);
    const probe = await dbClient.query(
      `SELECT app.current_user_id() AS user_id,
              app.can_receive_project_activity_topic($1) AS project_allowed,
              app.can_receive_user_notifications_topic($2) AS notifications_allowed`,
      [projectTopic, notificationTopic]
    );
    assert.equal(probe.rows[0].user_id, member.id);
    assert.equal(probe.rows[0].project_allowed, true);
    assert.equal(probe.rows[0].notifications_allowed, true);
    console.log("Live Preview topic predicates passed under authenticated role");
  } finally {
    await dbClient.query("ROLLBACK");
    dbClient.release();
  }

  const memberToken = await tokenFor(member);
  const outsiderToken = await tokenFor(outsider);
  const memberClient = await clientFor(memberToken);
  const outsiderClient = await clientFor(outsiderToken);
  const anonymousClient = createClient(
    memberToken.supabaseUrl,
    memberToken.supabasePublishableKey,
    {
      realtime: { transport: WebSocket },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  );
  clients.push(anonymousClient);

  let resolveActivity;
  let resolveNotification;
  const memberProject = subscribe(
    memberClient,
    projectTopic,
    "project-activity",
    (payload) => resolveActivity?.(payload)
  );
  const outsiderProject = subscribe(
    outsiderClient,
    projectTopic,
    "project-activity"
  );
  const memberNotifications = subscribe(
    memberClient,
    notificationTopic,
    "notification-snapshot",
    (payload) => resolveNotification?.(payload)
  );
  const outsiderNotifications = subscribe(
    outsiderClient,
    notificationTopic,
    "notification-snapshot"
  );
  const publicProbe = subscribe(
    anonymousClient,
    "nd373-public-access-probe",
    "probe",
    undefined,
    false
  );

  const memberProjectJoin = await memberProject.result;
  assert.equal(
    memberProjectJoin.allowed,
    true,
    `member join denied: ${memberProjectJoin.status}: ${memberProjectJoin.reason}`
  );
  assert.equal((await outsiderProject.result).allowed, false, "non-member join allowed");
  assert.equal((await memberNotifications.result).allowed, true, "own notification join denied");
  assert.equal((await outsiderNotifications.result).allowed, false, "cross-user notification join allowed");
  assert.equal((await publicProbe.result).allowed, false, "Supabase public channel access is enabled");
  console.log("Private project and notification join policies passed");

  const forged = await deadline(
    memberProject.channel.send({
      type: "broadcast",
      event: "project-activity",
      payload: { forged: true },
    }),
    "client publish"
  );
  assert.notEqual(forged, "ok", "client Broadcast publish was allowed");
  console.log("Client publish was denied");

  const activityReceived = deadline(
    new Promise((resolve) => { resolveActivity = resolve; }),
    "typed project activity"
  );
  const event = await prisma.projectActivityEvent.create({
    data: {
      projectId: project.id,
      actorUserId: owner.id,
      domain: "project",
      action: "updated",
      entityId: project.id,
      payload: { smoke: true },
    },
    select: { id: true },
  });
  const payload = await activityReceived;
  assert.equal(payload.eventId, event.id);
  assert.equal(payload.projectId, project.id);
  assert.equal(payload.domain, "project");
  assert.equal(payload.action, "updated");
  assert.equal(payload.payload?.smoke, true);
  console.log("Member received typed database-owned project activity");

  const notificationReceived = deadline(
    new Promise((resolve) => { resolveNotification = resolve; }),
    "notification snapshot"
  );
  await prisma.notification.create({
    data: {
      recipientUserId: member.id,
      type: "system",
      title: "ND-373 Broadcast smoke",
      sourceType: "nd373-preview-smoke",
      sourceId: crypto.randomUUID(),
    },
  });
  const notification = await notificationReceived;
  assert(notification.unreadCount >= 1);
  assert.equal(notification.latestUnreadNotification?.title, "ND-373 Broadcast smoke");
  console.log("Member received database-owned notification snapshot");

  browser = await chromium.launch();
  const ownerContext = await browserContextFor(owner);
  const memberContext = await browserContextFor(member);
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const healthyRequests = [];
  const sockets = [];
  memberPage.on("request", (request) => healthyRequests.push(request));
  memberPage.on("websocket", (socket) => sockets.push(socket.url()));
  const activityReconcile = memberPage.waitForRequest((request) =>
    new URL(request.url()).pathname === `/api/projects/${project.id}/activity` &&
    request.headers()["x-realtime-reconcile"] === "1"
  );
  const notificationReconcile = memberPage.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/account/notifications/summary" &&
    request.headers()["x-realtime-reconcile"] === "1"
  );
  await Promise.all([
    ownerPage.goto(`${baseUrl}/projects/${project.id}`),
    memberPage.goto(`${baseUrl}/projects/${project.id}`),
  ]);
  await Promise.all([activityReconcile, notificationReconcile]);
  assert(sockets.some((url) => url.includes("/realtime/v1/websocket")),
    "healthy browser did not open a Realtime socket");

  const browserName = "ND-373 Browser Broadcast";
  await renameProject(ownerPage, project.id, browserName);
  await waitForProjectName(memberPage, browserName);
  await prisma.notification.create({
    data: {
      recipientUserId: member.id,
      type: "system",
      title: "ND-373 browser notification",
      sourceType: "nd373-preview-smoke",
      sourceId: crypto.randomUUID(),
    },
  });
  await memberPage.waitForFunction(() =>
    [...document.querySelectorAll('a[href="/account/notifications"] .sr-only')]
      .some((element) => element.textContent?.includes("2 unread notifications")),
    null,
    { timeout: 25_000 }
  );
  assert(!healthyRequests.some(isStreamRequest),
    "healthy Broadcast browser requested an SSE stream");
  assert(!healthyRequests.some((request) => isActivityPoll(request, project.id)),
    "healthy Broadcast browser requested activity polling");
  console.log("Two browser sessions received project and notification changes over Broadcast without SSE or polling");

  const streamContext = await browserContextFor(member);
  await streamContext.route("**/api/realtime/token", (route) => route.abort());
  const streamPage = await streamContext.newPage();
  const streamRequest = streamPage.waitForRequest((request) =>
    new URL(request.url()).pathname === `/api/projects/${project.id}/activity/stream`
  );
  await streamPage.goto(`${baseUrl}/projects/${project.id}`);
  await streamRequest;
  const streamName = "ND-373 Browser SSE fallback";
  await renameProject(ownerPage, project.id, streamName);
  await waitForProjectName(streamPage, streamName);
  console.log("Blocked token request degraded to a working project SSE stream");

  const pollContext = await browserContextFor(member);
  await pollContext.route("**/api/realtime/token", (route) => route.abort());
  await pollContext.route("**/api/projects/*/activity/stream", (route) => route.abort());
  await pollContext.route("**/api/account/notifications/stream", (route) => route.abort());
  const pollPage = await pollContext.newPage();
  const pollRequest = pollPage.waitForRequest((request) =>
    isActivityPoll(request, project.id)
  );
  await pollPage.goto(`${baseUrl}/projects/${project.id}`);
  await pollRequest;
  const pollName = "ND-373 Browser polling fallback";
  await renameProject(ownerPage, project.id, pollName);
  await waitForProjectName(pollPage, pollName);
  console.log("Blocked token and stream requests degraded to working activity polling");

  await prisma.session.deleteMany({ where: { userId: member.id } });
  const signedOut = await fetch(`${baseUrl}/api/realtime/token`, {
    method: "POST",
    headers: { Cookie: `nexusdash.session-token=${member.sessionToken}` },
  });
  assert.equal(signedOut.status, 401, "signed-out session could mint a token");
  console.log("Signed-out session token mint was denied");
} finally {
  await browser?.close();
  await Promise.allSettled(
    clients.map(async (client) => {
      await client.removeAllChannels();
      client.realtime.disconnect();
    })
  );
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
}
