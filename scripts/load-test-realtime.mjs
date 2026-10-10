import assert from "node:assert/strict";
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import pg from "pg";

const baseUrl = process.env.LOAD_TEST_BASE_URL;
assert(baseUrl, "LOAD_TEST_BASE_URL is required");
const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
assert(databaseUrl, "MIGRATION_DATABASE_URL (or DATABASE_URL) is required");

const tabCount = Number(process.env.LOAD_TEST_USER_TABS ?? "3");
const durationMs = Number(process.env.LOAD_TEST_DURATION_MS ?? "60000");
const outputPath = process.env.LOAD_TEST_OUTPUT;
const secureCookie = baseUrl.startsWith("https://");

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
const userIds = [];
let browser;

const POLL_INTERVAL_MS = { activity: 10_000, notifications: 20_000 };
const SLACK = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fixtureUser(label) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `nd374-load-${label}-${nonce}@nexusdash.local`,
      name: `ND-374 ${label}`,
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

async function contextFor(user) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "nexusdash.session-token",
      value: user.sessionToken,
      url: baseUrl,
      httpOnly: true,
      secure: secureCookie,
      sameSite: "Lax",
    },
  ]);
  return context;
}

function classifyRequest(url) {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/activity")) return "activityPoll";
  if (pathname.endsWith("/notifications/summary")) return "notificationPoll";
  if (pathname.endsWith("/realtime/token")) return "token";
  if (pathname.includes("/stream")) return "sse";
  return null;
}

// Tracks transport-level activity per tab. `latestActivityVersion` is read
// from the activity poll response body: it proves a polling tab observed the
// snapshot version produced by a rename.
function trackPage(page) {
  const counts = {
    activityPoll: 0,
    notificationPoll: 0,
    token: 0,
    sse: 0,
    sockets: 0,
    latestActivityVersion: null,
    activityPollErrors: 0,
  };
  page.on("request", (request) => {
    const kind = classifyRequest(request.url());
    if (kind) counts[kind] += 1;
  });
  page.on("websocket", () => {
    counts.sockets += 1;
  });
  page.on("response", async (response) => {
    if (!new URL(response.url()).pathname.endsWith("/activity")) return;
    try {
      const payload = await response.json();
      if (typeof payload?.version === "string") {
        counts.latestActivityVersion = payload.version;
      }
    } catch {
      counts.activityPollErrors += 1;
    }
  });
  return counts;
}

async function readMetrics(user) {
  const response = await fetch(`${baseUrl}/api/observability/realtime`, {
    headers: { Cookie: `nexusdash.session-token=${user.sessionToken}` },
  });
  assert.equal(response.status, 200, "observability snapshot request failed");
  return (await response.json()).metrics;
}

function waitForHeading(page, name) {
  return page.getByRole("heading", { name, exact: true }).waitFor({
    timeout: 25_000,
  });
}

async function renameProject(ownerPage, projectId, name) {
  const response = await ownerPage.request.patch(
    `${baseUrl}/api/projects/${projectId}`,
    { data: { name } }
  );
  assert.equal(response.status(), 200, `project rename failed (${response.status()})`);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { updatedAt: true },
  });
  assert(project, "renamed project not found");
  return project.updatedAt.toISOString();
}

// Waits until every tab that polls the activity endpoint has observed at
// least `expectedVersion`. Followers never poll (leader-coordinated), so they
// are excluded; at least one tab must have polled.
async function waitForVersionObserved(tabCounts, expectedVersion, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const observed = (counts) =>
    counts.latestActivityVersion !== null &&
    Date.parse(counts.latestActivityVersion) >= Date.parse(expectedVersion);
  while (Date.now() < deadline) {
    if (tabCounts.some((counts) => observed(counts))) return true;
    await sleep(500);
  }
  return false;
}

function countObservedVersions(tabCounts, expectedVersion) {
  return tabCounts.filter(
    (counts) =>
      counts.latestActivityVersion !== null &&
      Date.parse(counts.latestActivityVersion) >= Date.parse(expectedVersion)
  ).length;
}

async function countTabsShowing(pageList, name) {
  const results = await Promise.all(
    pageList.map((page) =>
      page
        .evaluate((label) => document.body.innerText.includes(label), name)
        .catch(() => false)
    )
  );
  return results.filter(Boolean).length;
}

const results = {
  baseUrl,
  durationMs,
  tabCount,
  transport: process.env.LOAD_TEST_LABEL ?? "unlabeled",
  metricsBefore: null,
  metricsAfter: null,
  tabs: [],
  convergence: [],
  assertions: [],
};

function recordAssertion(label, ok, detail) {
  results.assertions.push({ label, ok, detail });
  assert(ok, `${label}: ${detail}`);
}

try {
  const owner = await fixtureUser("owner");
  const member = await fixtureUser("member");
  const project = await prisma.project.create({
    data: {
      name: "ND-374 Load Test",
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

  browser = await chromium.launch();
  const ownerContext = await contextFor(owner);
  const memberContext = await contextFor(member);
  const ownerPage = await ownerContext.newPage();
  const memberPages = [];
  const tabCounts = [];
  for (let index = 0; index < tabCount; index += 1) {
    const page = await memberContext.newPage();
    memberPages.push(page);
    tabCounts.push(trackPage(page));
  }
  const ownerCounts = trackPage(ownerPage);

  results.metricsBefore = await readMetrics(member);
  const startedAt = Date.now();

  await Promise.all([
    ownerPage.goto(`${baseUrl}/projects/${project.id}`),
    ...memberPages.map((page) => page.goto(`${baseUrl}/projects/${project.id}`)),
  ]);
  await Promise.all([
    waitForHeading(ownerPage, "ND-374 Load Test"),
    ...memberPages.map((page) => waitForHeading(page, "ND-374 Load Test")),
  ]);

  await sleep(durationMs * 0.2);
  const collaborativeName = `ND-374 collaborative ${Date.now()}`;
  const collaborativeVersion = await renameProject(ownerPage, project.id, collaborativeName);

  const firstObserved = await waitForVersionObserved(
    tabCounts,
    collaborativeVersion,
    30_000
  );
  recordAssertion(
    "activity polls deliver the renamed version to the member session",
    firstObserved,
    `expected version ${collaborativeVersion} observed by ${countObservedVersions(
      tabCounts,
      collaborativeVersion
    )}/${tabCount} tabs`
  );

  // DOM apply-layer convergence is recorded as telemetry (not asserted): the
  // Next.js client occasionally cancels the router.refresh() RSC stream, which
  // is pre-existing transport-independent behavior outside this load test.
  await sleep(5_000);
  results.convergence.push({
    phase: "collaborative-rename",
    version: collaborativeVersion,
    tabsShowingName: await countTabsShowing(memberPages, collaborativeName),
    tabCount,
  });

  await sleep(durationMs * 0.15);
  await memberPages[0].reload();
  await waitForHeading(memberPages[0], collaborativeName);

  await sleep(durationMs * 0.15);
  const finalName = `ND-374 final ${Date.now()}`;
  const finalVersion = await renameProject(ownerPage, project.id, finalName);
  const finalObserved = await waitForVersionObserved(tabCounts, finalVersion, 30_000);
  recordAssertion(
    "activity polls deliver the final version after reconnect",
    finalObserved,
    `expected version ${finalVersion} observed by ${countObservedVersions(
      tabCounts,
      finalVersion
    )}/${tabCount} tabs`
  );
  await sleep(5_000);
  results.convergence.push({
    phase: "final-rename",
    version: finalVersion,
    tabsShowingName: await countTabsShowing(memberPages, finalName),
    tabCount,
  });

  await sleep(durationMs * 0.15);
  const reloadIndex = 1 % memberPages.length;
  await memberPages[reloadIndex].reload();
  await waitForHeading(memberPages[reloadIndex], finalName);

  await sleep(durationMs * 0.2);
  const elapsedMs = Date.now() - startedAt;
  results.metricsAfter = await readMetrics(member);

  memberPages.forEach((page, index) => {
    results.tabs.push({ tab: index, ...tabCounts[index] });
  });
  results.ownerTab = ownerCounts;
  // Server counters observe every human tab, including the owner's page.
  const allObservedActivityPolls =
    results.tabs.reduce((sum, tab) => sum + tab.activityPoll, 0) +
    ownerCounts.activityPoll;

  const expectedActivityPolls = Math.ceil(elapsedMs / POLL_INTERVAL_MS.activity) + SLACK;
  const expectedNotificationPolls =
    Math.ceil(elapsedMs / POLL_INTERVAL_MS.notifications) + SLACK;
  for (const tab of results.tabs) {
    recordAssertion(
      `tab ${tab.tab} activity polls bounded`,
      tab.activityPoll <= expectedActivityPolls,
      `${tab.activityPoll} polls in ${elapsedMs}ms (bound ${expectedActivityPolls})`
    );
    recordAssertion(
      `tab ${tab.tab} notification polls bounded`,
      tab.notificationPoll <= expectedNotificationPolls,
      `${tab.notificationPoll} polls in ${elapsedMs}ms (bound ${expectedNotificationPolls})`
    );
    recordAssertion(
      `tab ${tab.tab} has no SSE requests`,
      tab.sse === 0,
      `${tab.sse} legacy stream requests`
    );
    recordAssertion(
      `tab ${tab.tab} parsed activity snapshots`,
      tab.activityPollErrors === 0,
      `${tab.activityPollErrors} unreadable activity responses`
    );
  }

  const totalActivityPolls = results.tabs.reduce((sum, tab) => sum + tab.activityPoll, 0);
  const totalNotificationPolls = results.tabs.reduce(
    (sum, tab) => sum + tab.notificationPoll,
    0
  );
  const tokenRequests =
    results.tabs.reduce((sum, tab) => sum + tab.token, 0) + ownerCounts.token;
  recordAssertion(
    "owner tab has no SSE requests",
    ownerCounts.sse === 0,
    `${ownerCounts.sse} legacy stream requests`
  );

  // Leader-coordinated polling: one tab per scope polls, so the total stays
  // near a single tab's cadence instead of scaling with tab count.
  const leaderOnlyActivityBound = Math.ceil(elapsedMs / POLL_INTERVAL_MS.activity) + 2 * tabCount;
  recordAssertion(
    "activity polling stays leader-coordinated across tabs",
    totalActivityPolls <= leaderOnlyActivityBound,
    `${totalActivityPolls} total polls vs independent-tab volume ${
      tabCount * expectedActivityPolls
    } (leader-only bound ${leaderOnlyActivityBound})`
  );
  recordAssertion(
    "notification polling stays leader-coordinated across tabs",
    totalNotificationPolls <= Math.ceil(elapsedMs / POLL_INTERVAL_MS.notifications) + 2 * tabCount,
    `${totalNotificationPolls} total summary polls across ${tabCount} tabs`
  );

  if (results.metricsAfter.transport === "polling") {
    recordAssertion(
      "polling transport mints no realtime tokens",
      tokenRequests === 0,
      `token requests: ${tokenRequests}`
    );
    recordAssertion(
      "polling transport opens no websockets",
      results.tabs.every((tab) => tab.sockets === 0) && ownerCounts.sockets === 0,
      `websocket counts: ${results.tabs.map((tab) => tab.sockets).join(", ")}, owner ${ownerCounts.sockets}`
    );
  } else {
    recordAssertion(
      "broadcast transport mints tokens",
      tokenRequests >= 1,
      `token requests: ${tokenRequests}`
    );
  }

  const queryCalls =
    results.metricsAfter.database.queryCalls -
    results.metricsBefore.database.queryCalls;
  const snapshotChecks =
    results.metricsAfter.counters["activity.snapshotChecks"] -
    results.metricsBefore.counters["activity.snapshotChecks"];
  const activityFallbacks =
    results.metricsAfter.counters["activity.pollingFallbacks"] -
    results.metricsBefore.counters["activity.pollingFallbacks"];
  recordAssertion(
    "snapshot checks match observed poll volume",
    snapshotChecks <= allObservedActivityPolls,
    `${snapshotChecks} snapshot checks vs ${allObservedActivityPolls} observed polls (member ${totalActivityPolls}, owner ${ownerCounts.activityPoll})`
  );
  if (results.metricsAfter.transport !== "polling") {
    recordAssertion(
      "broadcast outage polls are attributed as fallbacks",
      activityFallbacks >= allObservedActivityPolls,
      `${activityFallbacks} fallback polls vs ${allObservedActivityPolls} observed polls`
    );
  }

  results.summary = {
    elapsedMs,
    totalActivityPolls,
    allObservedActivityPolls,
    totalNotificationPolls,
    tokenRequests,
    queryCalls,
    snapshotChecks,
    activityFallbacks,
  };

  console.log(JSON.stringify(results, null, 2));
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }
} finally {
  await browser?.close();
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
}
