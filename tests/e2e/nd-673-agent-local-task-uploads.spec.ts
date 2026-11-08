import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("bearer multipart uploads retain actor identity, limits and comment privacy", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd673"), ownerId: userId, memberships: { create: { userId, role: "owner" } } } });
  const prefix = `/api/projects/${project.id}`;
  const files: string[] = [];
  let taskUrl: string | undefined;
  try {
    const actors: { id: string; headers: Record<string, string> }[] = [];
    for (const [label, scopes] of [["Local uploader", ["task:read", "task:write"]], ["Read only", ["task:read"]]] as const) {
      const created = await page.request.post(`${prefix}/agent-access`, { data: { label, scopes } });
      expect(created.status()).toBe(201);
      const credential = await created.json();
      const token = await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } });
      expect(token.ok()).toBeTruthy();
      actors.push({ id: credential.credential.id, headers: { Authorization: `Bearer ${(await token.json()).accessToken}` } });
    }
    const created = await page.request.post(`${prefix}/tasks`, { headers: actors[0].headers, data: { title: "Local file lifecycle" } });
    expect(created.status()).toBe(201);
    taskUrl = `${prefix}/tasks/${(await created.json()).taskId}`;
    const bytes = Buffer.from("Local agent file");
    const file = { name: "agent.txt", mimeType: "text/plain", buffer: bytes };
    for (const [headers, expected] of [[actors[1].headers, 403], [{ Authorization: "Bearer invalid-token" }, 401]] as const) {
      expect((await page.request.post(`${taskUrl}/attachments`, { headers, multipart: { kind: "file", file } })).status()).toBe(expected);
    }
    expect((await page.request.post(`${taskUrl}/attachments`, { headers: actors[0].headers, multipart: { kind: "file", file: { name: "bad.exe", mimeType: "application/octet-stream", buffer: bytes } } })).status()).toBe(400);
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      expect((await page.request.post(`${taskUrl}/attachments`, { headers: actors[0].headers, multipart: { kind: "file", file: { ...file, buffer: Buffer.alloc(4 * 1024 * 1024 + 1) } } })).status()).toBe(400);
    }
    for (const isDraft of [false, true]) {
      const response = await page.request.post(`${taskUrl}/attachments`, { headers: actors[0].headers, multipart: { kind: "file", file, isCommentDraft: String(isDraft) } });
      expect(response.status()).toBe(200);
      const attachment = (await response.json()).attachment;
      files.push(attachment.id);
      expect(attachment.uploadedBy).toEqual({ kind: "agent", id: actors[0].id, displayName: "Local uploader" });
      expect(await (await page.request.get(attachment.downloadUrl, { headers: actors[0].headers })).body()).toEqual(bytes);
      if (isDraft) {
        for (const headers of [{}, actors[1].headers]) expect((await page.request.get(attachment.downloadUrl, { headers })).status()).toBe(404);
        const comment = await page.request.post(`${taskUrl}/comments`, { headers: actors[0].headers, data: { attachmentIds: [attachment.id] } });
        expect(comment.status()).toBe(201);
        expect((await comment.json()).comment.attachments[0].uploadedBy.id).toBe(actors[0].id);
      }
      expect((await page.request.get(attachment.downloadUrl, { headers: actors[1].headers })).status()).toBe(200);
    }
    expect((await page.request.delete(`${taskUrl}/attachments/${files[0]}`, { headers: actors[0].headers })).status()).toBe(200);
    expect((await page.request.get(`${taskUrl}/attachments/${files[0]}/download`, { headers: actors[0].headers })).status()).toBe(404);
  } finally {
    if (taskUrl) for (const id of files) await page.request.delete(`${taskUrl}/attachments/${id}`);
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
