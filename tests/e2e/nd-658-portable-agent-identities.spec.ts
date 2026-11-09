import { expect, test, type APIRequestContext } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { issueAgentAccessToken } from "../../lib/auth/agent-token-service";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("a new owner reauthorizes the same identity without reviving the previous owner's devices", async ({
  page,
  browser,
}, testInfo) => {
  const previousOwnerId = await signInAsVerifiedUser(page);
  const created = await page.request.post("/api/projects", {
    data: { name: uniqueProjectName("nd658-transfer") },
  });
  const { project } = await created.json();
  const root = `/api/projects/${project.id}`;
  const scopes = ["task:read", "task:write"];
  const identityResponse = await page.request.post(`${root}/agent-identities`, {
    data: {
      operation: "create",
      name: "Oscar",
      scopes,
      canMoveTasksToDone: false,
    },
  });
  const { identityId } = await identityResponse.json();
  const pairAndStart = async (request: APIRequestContext) => {
    const authorized = await request.post(`${root}/agent-identities`, {
      data: {
        operation: "authorize-device",
        identityId,
        name: "Laptop",
        scopes,
        canMoveTasksToDone: false,
      },
    });
    expect(authorized.ok(), await authorized.text()).toBeTruthy();
    const { pairingCode } = await authorized.json();
    const paired = await request.post("/api/auth/agent/runtime", {
      data: {
        operation: "pair",
        projectId: project.id,
        identityId,
        proof: pairingCode,
      },
    });
    expect(paired.ok(), await paired.text()).toBeTruthy();
    const { runtimeCredential } = await paired.json();
    const started = await request.post("/api/auth/agent/runtime", {
      data: {
        operation: "start",
        projectId: project.id,
        identityId,
        proof: runtimeCredential,
        client: "Codex",
      },
    });
    expect(started.ok(), await started.text()).toBeTruthy();
    return started.json();
  };
  const oldSession = await pairAndStart(page.request);
  const newContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const newPage = await newContext.newPage();
    const nextOwnerId = await signInAsVerifiedUser(newPage);
    const membership = await prisma.projectMembership.create({
      data: { projectId: project.id, userId: nextOwnerId, role: "editor" },
    });
    expect(
      (
        await page.request.post(`${root}/ownership/transfer`, {
          data: {
            newOwnerMembershipId: membership.id,
            previousOwnerLeaves: true,
          },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await page.request.get(`${root}/tasks`, {
          headers: { Authorization: `Bearer ${oldSession.accessToken}` },
        })
      ).status()
    ).toBe(401);
    const freshSession = await pairAndStart(newPage.request);
    expect(freshSession.identityId).toBe(identityId);
    const taskResponse = await newPage.request.post(`${root}/tasks`, {
      headers: { Authorization: `Bearer ${freshSession.accessToken}` },
      data: { title: "Same actor, new authorization" },
    });
    expect(taskResponse.ok(), await taskResponse.text()).toBeTruthy();
    expect((await taskResponse.json()).task.createdBy.id).toBe(identityId);
    expect(
      (
        await prisma.apiCredential.findUniqueOrThrow({
          where: { id: identityId },
        })
      ).createdByUserId
    ).toBe(previousOwnerId);
  } finally {
    await newContext.close();
  }
});

test("portable identities enforce runtime bindings, live grants and independent revocation", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const ownerId = await signInAsVerifiedUser(page);
  const name = uniqueProjectName("nd658");
  await createProjectFromProjectsPage(page, name);
  await openNewestProjectDashboard(page, name);
  const projectId = page.url().match(/\/projects\/([^/?#]+)/)![1];
  const root = `/api/projects/${projectId}`;
  const scopes = ["project:read", "task:read", "task:write"];
  const manage = async (
    data: Record<string, unknown>,
    request: APIRequestContext = page.request
  ) => {
    const response = await request.post(`${root}/agent-identities`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const runtime = (data: Record<string, unknown>) =>
    page.request.post("/api/auth/agent/runtime", {
      data: { projectId, ...data },
    });
  await page.getByRole("button", { name: "Share project" }).click();
  await page.getByRole("button", { name: "Agent access", exact: true }).click();
  const panel = page.getByRole("region", { name: "Agent identities" });
  await panel.getByRole("button", { name: "New identity" }).click();
  await panel.getByLabel("Name", { exact: true }).fill("Oscar");
  await panel.getByLabel("Descriptive labels (optional)").fill("Orchestrator");
  await panel.getByLabel("Descriptive labels (optional)").press("Enter");
  await panel.getByLabel("Allow moving tasks to Done", { exact: true }).check();
  await panel
    .getByRole("button", { name: "Create identity", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Oscar", exact: true })
  ).toBeVisible();
  const identities = await (
    await page.request.get(`${root}/agent-identities`)
  ).json();
  const oscar = identities.identities.find(
    (i: { name: string }) => i.name === "Oscar"
  );
  expect(oscar.descriptiveLabels).toEqual(["Orchestrator"]);
  expect(oscar.canMoveTasksToDone).toBe(true);
  expect(
    (
      await page.request.post(`${root}/agent-access/${oscar.id}/rotate`)
    ).status()
  ).toBe(409);
  const unbound = issueAgentAccessToken({
    credentialId: oscar.id,
    credentialPublicId: "unbound-test-generation",
    projectId,
    ownerUserId: ownerId,
    scopes: ["task:read"],
  });
  expect(
    (
      await page.request.get(`${root}/tasks`, {
        headers: { Authorization: `Bearer ${unbound.accessToken}` },
      })
    ).status()
  ).toBe(401);
  expect(JSON.stringify(identities)).not.toMatch(
    /secretHash|tokenHash|pairingHash/
  );
  await panel.getByText("Authorize a device", { exact: true }).click();
  await panel.getByLabel("Device name", { exact: true }).fill("Laptop one");
  // Selecting the identity initializes device grants.
  const permissionInputs = panel
    .locator("details")
    .filter({ hasText: "Authorize a device" })
    .getByRole("checkbox");
  for (let i = 0; i < (await permissionInputs.count()); i++)
    await permissionInputs.nth(i).check();
  await panel.getByRole("button", { name: "Generate pairing code" }).click();
  const code = panel.locator("[data-pairing-code]");
  await expect(panel.getByRole("button", { name: "Copy pairing command", exact: true })).toBeVisible();
  await expect(code).toBeVisible();
  await expect(panel.locator("pre")).toContainText(
    `--base ${new URL(page.url()).origin}`
  );
  const pairingValue = await code.innerText();
  const paired = await runtime({
    operation: "pair",
    identityId: oscar.id,
    proof: pairingValue,
  });
  expect(paired.ok(), await paired.text()).toBeTruthy();
  const first = await paired.json();
  expect(
    (
      await runtime({
        operation: "pair",
        identityId: oscar.id,
        proof: pairingValue,
      })
    ).status()
  ).toBe(401);
  await expect(panel.getByText("Device paired. Ready to launch.")).toBeVisible({ timeout: 30000 });
  await expect(code).toHaveCount(0);
  const launch = panel.getByRole("button", { name: "Copy Windows launch command" });
  await launch.focus();
  await expect(launch).toBeFocused();
  await page.screenshot({ path: ".tmp/nd824-paired-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await launch.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".tmp/nd824-paired-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("button", { name: "Dismiss pairing guidance" }).click();
  const secondCode = await manage({
    operation: "authorize-device",
    identityId: oscar.id,
    name: "Laptop two",
    scopes,
    canMoveTasksToDone: true,
  });
  const second = await (
    await runtime({
      operation: "pair",
      identityId: oscar.id,
      proof: secondCode.pairingCode,
    })
  ).json();
  const start = async (proof: string, identityId: string, client: string) => {
    const response = await runtime({
      operation: "start",
      identityId,
      proof,
      client,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const one = await start(first.runtimeCredential, oscar.id, "Codex");
  const concurrent = await start(first.runtimeCredential, oscar.id, "Gemini");
  const two = await start(second.runtimeCredential, oscar.id, "Claude Code");
  expect(
    new Set([one.sessionId, concurrent.sessionId, two.sessionId]).size
  ).toBe(3);
  expect(one.identityId).toBe(two.identityId);
  expect(one.expiresInSeconds).toBeLessThanOrEqual(300);
  const headers = (session: { accessToken: string }) => ({
    Authorization: `Bearer ${session.accessToken}`,
  });
  const read = (session: { accessToken: string }) =>
    page.request.get(`${root}/tasks`, { headers: headers(session) });
  expect((await read(one)).ok()).toBeTruthy();
  const taskResponse = await page.request.post(`${root}/tasks`, {
    headers: headers(one),
    data: {
      title: "Oscar contribution",
      assignee: { kind: "agent", id: oscar.id },
    },
  });
  expect(taskResponse.ok(), await taskResponse.text()).toBeTruthy();
  const { task } = await taskResponse.json();
  expect(task.createdBy.id).toBe(oscar.id);
  const posted = await page.request.post(`${root}/tasks/${task.id}/comments`, {
    headers: headers(one), data: { content: "Portable identity comment" },
  });
  expect(posted.status()).toBe(201);
  const originalComment = (await posted.json()).comment;
  expect(originalComment.author.agentCredentialDescriptiveLabels).toEqual(["Orchestrator"]);
  await manage({ operation: "update", identityId: oscar.id, name: "Oscar",
    descriptiveLabels: ["Coordinator", "Codex"], scopes, canMoveTasksToDone: true });
  const comments = (await (await page.request.get(`${root}/tasks/${task.id}/comments`)).json()).comments;
  expect(comments.find((comment: { id: string }) => comment.id === originalComment.id).author.agentCredentialDescriptiveLabels).toEqual(["Coordinator", "Codex"]);

  // A legacy identity can also authorize devices. Rotating its API key must
  // reject old legacy tokens without ending independent device sessions.
  const legacyResponse = await page.request.post(`${root}/agent-access`, {
    data: { label: "Legacy runtime actor", scopes },
  });
  expect(legacyResponse.status()).toBe(201);
  const legacy = await legacyResponse.json();
  const legacyToken = await page.request.post("/api/auth/agent/token", { data: { apiKey: legacy.apiKey } });
  expect(legacyToken.status()).toBe(200);
  const oldLegacyToken = await legacyToken.json();
  const legacyGrant = await manage({ operation: "authorize-device", identityId: legacy.credential.id,
    name: "Legacy laptop", scopes, canMoveTasksToDone: false });
  const legacyPair = await runtime({ operation: "pair", identityId: legacy.credential.id, proof: legacyGrant.pairingCode });
  expect(legacyPair.status()).toBe(200);
  const legacyProof = (await legacyPair.json()).runtimeCredential;
  const legacySession = await start(legacyProof, legacy.credential.id, "Codex");
  const rotated = await page.request.post(`${root}/agent-access/${legacy.credential.id}/rotate`);
  expect(rotated.status()).toBe(200);
  const replacement = await page.request.post("/api/auth/agent/token", { data: { apiKey: (await rotated.json()).apiKey } });
  expect(replacement.status()).toBe(200);
  expect((await read(await replacement.json())).ok()).toBeTruthy();
  expect((await read(oldLegacyToken)).status()).toBe(401);
  expect((await read(legacySession)).ok()).toBeTruthy();
  const legacyRenewed = await runtime({ operation: "renew", identityId: legacy.credential.id,
    proof: legacyProof, sessionId: legacySession.sessionId });
  expect(legacyRenewed.status()).toBe(200);
  expect((await read(await legacyRenewed.json())).ok()).toBeTruthy();

  const mentioned = await page.request.post(
    `${root}/tasks/${task.id}/comments`,
    {
      data: {
        content: "@{Oscar} review this",
        agentMentionSelections: [{ credentialId: oscar.id }],
      },
    }
  );
  expect(mentioned.ok(), await mentioned.text()).toBeTruthy();
  const status = (session: { accessToken: string }, value = "Done") =>
    page.request.post(`${root}/tasks/${task.id}/status`, {
      headers: headers(session),
      data: { status: value },
    });
  expect((await status(one)).ok()).toBeTruthy();
  expect((await status(one, "Backlog")).ok()).toBeTruthy();
  const nova = await manage({
    operation: "create",
    name: "Nova",
    scopes,
    canMoveTasksToDone: false,
  });
  const novaCode = await manage({
    operation: "authorize-device",
    identityId: nova.identityId,
    name: "Worker laptop",
    scopes,
    canMoveTasksToDone: false,
  });
  const novaDevice = await (
    await runtime({
      operation: "pair",
      identityId: nova.identityId,
      proof: novaCode.pairingCode,
    })
  ).json();
  const novaSession = await start(
    novaDevice.runtimeCredential,
    nova.identityId,
    "Codex"
  );
  expect((await status(novaSession)).status()).toBe(403);
  expect(
    (
      await page.request.post(`${root}/tasks/reorder`, {
        headers: headers(novaSession),
        data: { columns: [{ status: "Done", taskIds: [task.id] }] },
      })
    ).status()
  ).toBe(403);
  for (const invalid of [
    { identityId: nova.identityId },
    { projectId: "wrong-project" },
    { identityId: undefined },
    { proof: "unauthorized" },
  ])
    expect(
      (
        await runtime({
          operation: "start",
          identityId: oscar.id,
          proof: first.runtimeCredential,
          client: "Codex",
          ...invalid,
        })
      ).status()
    ).toBe(401);
  expect(
    (
      await page.request.get("/api/projects/wrong-project/tasks", {
        headers: headers(one),
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await runtime({
        operation: "renew",
        identityId: oscar.id,
        proof: second.runtimeCredential,
        sessionId: one.sessionId,
      })
    ).status()
  ).toBe(401);
  expect(
    (
      await runtime({
        operation: "renew",
        identityId: oscar.id,
        proof: first.runtimeCredential,
      })
    ).status()
  ).toBe(401);
  const renewed = await (
    await runtime({
      operation: "renew",
      identityId: oscar.id,
      proof: first.runtimeCredential,
      sessionId: one.sessionId,
    })
  ).json();
  expect(renewed.sessionId).toBe(one.sessionId);
  expect((await read(renewed)).ok()).toBeTruthy();
  await manage({
    operation: "update",
    identityId: oscar.id,
    name: "Oscar",
    descriptiveLabels: ["Orchestrator"],
    scopes: ["task:read"],
    canMoveTasksToDone: false,
  });
  expect((await read(one)).ok()).toBeTruthy();
  expect((await status(one)).status()).toBe(403);
  await manage({
    operation: "update",
    identityId: oscar.id,
    name: "Oscar",
    descriptiveLabels: ["Orchestrator"],
    scopes,
    canMoveTasksToDone: true,
  });
  await manage({
    operation: "end-session",
    identityId: oscar.id,
    sessionId: one.sessionId,
  });
  expect((await read(one)).status()).toBe(401);
  expect((await read(concurrent)).ok()).toBeTruthy();
  expect((await read(two)).ok()).toBeTruthy();
  await manage({
    operation: "revoke-device",
    identityId: oscar.id,
    deviceId: first.deviceId,
  });
  expect((await read(concurrent)).status()).toBe(401);
  expect(
    (
      await runtime({
        operation: "start",
        identityId: oscar.id,
        proof: first.runtimeCredential,
        client: "Codex",
      })
    ).status()
  ).toBe(401);
  expect((await read(two)).ok()).toBeTruthy();
  const events = await prisma.authAuditEvent.findMany({
    where: { credentialId: oscar.id, action: "request_used" },
  });
  expect(
    events.some(
      (e) => (e.metadata as { sessionId?: string })?.sessionId === two.sessionId
    )
  ).toBe(true);
  expect(
    events.some(
      (e) =>
        (e.metadata as { deviceName?: string })?.deviceName === "Laptop two"
    )
  ).toBe(true);
  const outsider = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const otherPage = await outsider.newPage();
    await signInAsVerifiedUser(otherPage);
    expect(
      (await otherPage.request.get(`${root}/agent-identities`)).status()
    ).toBe(404);
    expect(
      (
        await otherPage.request.post(`${root}/agent-identities`, {
          data: { operation: "deactivate", identityId: oscar.id },
        })
      ).status()
    ).toBe(404);
  } finally {
    await outsider.close();
  }
  await panel.getByRole("button", { name: "Refresh identities" }).click();
  await panel.getByRole("button", { name: /Oscar Orchestrator/ }).click();
  await expect(panel.getByText("Laptop two", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("identities-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.getByRole("button", { name: "Edit identity" })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("identities-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await prisma.agentRuntimeSession.update({
    where: { id: two.sessionId },
    data: { expiresAt: new Date(0) },
  });
  expect((await read(two)).status()).toBe(401);
  const last = await start(second.runtimeCredential, oscar.id, "Codex");
  await manage({ operation: "deactivate", identityId: oscar.id });
  expect((await read(last)).status()).toBe(401);
  expect(
    (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
      .createdByCredentialId
  ).toBe(oscar.id);
  expect(await prisma.apiCredential.count({ where: { id: oscar.id } })).toBe(1);
  expect(
    (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
      .assigneeCredentialId
  ).toBe(oscar.id);
  expect(
    await prisma.taskCommentAgentMention.count({
      where: { taskId: task.id, agentCredentialId: oscar.id },
    })
  ).toBe(1);
});
