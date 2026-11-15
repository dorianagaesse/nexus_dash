import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("published actor discovery and mention examples match runtime contracts", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd674"), ownerId: userId, memberships: { create: { userId, role: "owner" } } } });
  const prefix = `/api/projects/${project.id}`;
  const actors: { id: string; headers: Record<string, string> }[] = [];
  try {
    for (const [label, scope] of [["Project reader", "project:read"], ["Task reader", "task:read"], ["Mention writer", "task:write"], ["Unrelated scope", "context:read"]]) {
      const created = await page.request.post(`${prefix}/agent-access`, { data: { label, scopes: [scope] } });
      expect(created.status()).toBe(201);
      const credential = await created.json();
      const token = await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } });
      expect(token.ok()).toBeTruthy();
      actors.push({ id: credential.credential.id, headers: { Authorization: `Bearer ${(await token.json()).accessToken}` } });
    }
    const docResponse = await page.request.get("/api/docs/agent/v1/openapi.json");
    expect(docResponse.ok()).toBeTruthy();
    const doc = await docResponse.json();
    expect(doc.paths["/api/projects/{projectId}/actors/search"].get["x-scope-match"]).toBe("any");
    for (const actor of actors.slice(0, 3)) {
      const response = await page.request.get(`${prefix}/actors/search?query=%20%40PROJECT%20`, { headers: actor.headers });
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect((await response.json()).actors).toEqual([expect.objectContaining({ kind: "agent", id: actors[0].id, displayName: "Project reader", status: "active", isAssignable: true, projectRole: null, isOwner: false })]);
    }
    expect((await page.request.get(`${prefix}/actors/search`, { headers: actors[3].headers })).status()).toBe(403);
    expect((await page.request.get("/api/projects/missing-project/actors/search", { headers: actors[0].headers })).status()).toBe(404);
    const discovery = (await (await page.request.get(`${prefix}/actors/search`, { headers: actors[2].headers })).json()).actors;
    const human = discovery.find((actor: { kind: string }) => actor.kind === "human");
    const [username, discriminator] = human.usernameTag.split("#");
    const task = await page.request.post(`${prefix}/tasks`, { headers: actors[2].headers, data: { title: "Mention contracts" } });
    expect(task.status()).toBe(201);
    const url = `${prefix}/tasks/${(await task.json()).taskId}/comments`;
    const content = `<p>Please review @${human.usernameTag} and @{Project reader}.</p>`;
    const created = await page.request.post(url, { headers: actors[2].headers, data: { content, mentionSelections: [{ userId: human.id, username, discriminator }], agentMentionSelections: [{ credentialId: actors[0].id }] } });
    expect(created.status()).toBe(201);
    let comment = (await created.json()).comment;
    expect(comment.agentMentions).toEqual([{ credentialId: actors[0].id, label: "Project reader" }]);
    const read = await page.request.get(url, { headers: actors[1].headers });
    expect(read.status()).toBe(200);
    comment = (await read.json()).comments.find((item: { id: string }) => item.id === comment.id);
    const preserved = await page.request.patch(`${url}/${comment.id}`, { headers: actors[2].headers, data: { content: content.replace("Please", "Updated: please"), agentMentionSelections: comment.agentMentions.map(({ credentialId }: { credentialId: string }) => ({ credentialId })) } });
    expect(preserved.status()).toBe(200);
    expect((await preserved.json()).comment.agentMentions).toEqual(comment.agentMentions);
    const cleared = await page.request.patch(`${url}/${comment.id}`, { headers: actors[2].headers, data: { content } });
    expect(cleared.status()).toBe(200);
    expect((await cleared.json()).comment.agentMentions).toBeUndefined();
    const longHtml = `<p>${"a".repeat(4000)}</p>`;
    expect(longHtml.length).toBeGreaterThan(4000);
    expect((await page.request.post(url, { headers: actors[2].headers, data: { content: longHtml } })).status()).toBe(201);
    expect((await page.request.patch(`${url}/${comment.id}`, { headers: actors[2].headers, data: { content: longHtml } })).status()).toBe(200);
    expect((await page.request.patch(`${url}/${comment.id}`, { headers: actors[2].headers, data: { content: `<p>${"a".repeat(4001)}</p>` } })).status()).toBe(400);
    await prisma.apiCredential.update({ where: { id: actors[0].id }, data: { revokedAt: new Date() } });
    const afterRevocation = await page.request.get(`${prefix}/actors/search?query=project`, { headers: actors[1].headers });
    expect((await afterRevocation.json()).actors).toEqual([]);
    await page.goto("/docs/agent/v1");
    await expect(page.getByText("Any one of:", { exact: true })).toBeVisible();
    await expect(page.getByText("Search project actors", { exact: true })).toBeVisible();
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
