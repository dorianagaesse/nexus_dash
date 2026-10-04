import assert from "node:assert/strict";
import crypto from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
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

function deadline(promise, label, ms = 20_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
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
  const channel = client.channel(topic, { config: { private: privateChannel } });
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
  const activityReceived = deadline(
    new Promise((resolve) => { resolveActivity = resolve; }),
    "typed project activity"
  );
  const memberProject = subscribe(
    memberClient,
    projectTopic,
    "project-activity",
    resolveActivity
  );
  const outsiderProject = subscribe(
    outsiderClient,
    projectTopic,
    "project-activity"
  );
  const memberNotifications = subscribe(
    memberClient,
    notificationTopic,
    "notification-snapshot"
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
} finally {
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
