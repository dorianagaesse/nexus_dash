import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { saveAttachmentFile } from "../../lib/attachment-storage";
import { taskUploadStorageOwnerId } from "../../lib/task-attachment-actor";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("unpublished task files belong to a human or a single credential, including concurrent binding", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd670"), ownerId: userId, memberships: { create: { userId, role: "owner" } } } });
  const prefix = `/api/projects/${project.id}`;
  const task = await prisma.task.create({ data: { projectId: project.id, title: "Draft ownership", status: "Backlog", position: 0 } });
  const taskUrl = `${prefix}/tasks/${task.id}`;
  const actors: { id?: string; headers: Record<string, string> }[] = [{ headers: {} }];
  const files: { id: string; key: string }[] = [];
  try {
    for (const label of ["Draft A", "Draft B"]) {
      const response = await page.request.post(`${prefix}/agent-access`, { data: { label, scopes: ["task:read", "task:write"] } });
      expect(response.status()).toBe(201);
      const credential = await response.json();
      const token = await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } });
      expect(token.ok()).toBeTruthy();
      actors.push({ id: credential.credential.id, headers: { Authorization: `Bearer ${(await token.json()).accessToken}` } });
    }
    const metadata = { name: "private.txt", mimeType: "text/plain", sizeBytes: 13 };
    const bytes = Buffer.from("private draft");
    for (const [index, actor] of actors.entries()) {
      const target = await page.request.post(`${taskUrl}/attachments/upload-url`, { headers: actor.headers, data: metadata });
      let key: string;
      if (target.ok()) {
        const { upload } = await target.json();
        key = upload.storageKey;
        expect((await page.request.put(upload.uploadUrl, { headers: upload.headers, data: bytes })).ok()).toBeTruthy();
      } else {
        expect(process.env.PLAYWRIGHT_BASE_URL).toBeFalsy();
        expect(target.status()).toBe(400);
        key = (await saveAttachmentFile({ scope: "task", actorUserId: userId, projectId: project.id, ownerId: taskUploadStorageOwnerId(task.id, actor.id), file: new File([bytes], metadata.name, { type: metadata.mimeType }) })).storageKey;
      }
      for (const other of actors.filter((_, otherIndex) => otherIndex !== index)) {
        expect((await page.request.post(`${taskUrl}/attachments/direct`, { headers: other.headers, data: { ...metadata, storageKey: key, isCommentDraft: true } })).status()).toBe(400);
        expect((await page.request.post(`${taskUrl}/attachments/direct/cleanup`, { headers: other.headers, data: { storageKey: key } })).status()).toBe(400);
      }
      const response = await page.request.post(`${taskUrl}/attachments/direct`, { headers: actor.headers, data: { ...metadata, storageKey: key, isCommentDraft: true } });
      expect(response.ok()).toBeTruthy();
      const attachment = (await response.json()).attachment;
      files.push({ id: attachment.id, key });
      expect((await page.request.get(attachment.downloadUrl, { headers: actor.headers })).status()).toBe(200);
      expect((await page.request.post(`${taskUrl}/attachments/direct/cleanup`, { headers: actor.headers, data: { storageKey: key } })).status()).toBe(409);
      expect((await page.request.post(`${taskUrl}/attachments/direct`, { headers: actor.headers, data: { ...metadata, storageKey: key, isCommentDraft: true } })).status()).toBe(409);
      for (const other of actors.filter((_, otherIndex) => otherIndex !== index)) {
        expect((await page.request.get(attachment.downloadUrl, { headers: other.headers })).status()).toBe(404);
        expect((await page.request.post(`${taskUrl}/comments`, { headers: other.headers, data: { content: "Cannot claim", attachmentIds: [attachment.id] } })).status()).toBe(400);
        // The human project owner has an explicit removal-only moderation exception.
        if (other.id) expect((await page.request.delete(`${taskUrl}/attachments/${attachment.id}`, { headers: other.headers })).status()).toBe(403);
      }
    }
    const a = actors[1];
    const draft = files[1];
    const attempts = await Promise.all([1, 2].map(() => page.request.post(`${taskUrl}/comments`, { headers: a.headers, data: { content: "Publish once", attachmentIds: [draft.id] } })));
    expect(attempts.filter(response => response.status() === 201)).toHaveLength(1);
    expect(attempts.filter(response => [400, 409].includes(response.status()))).toHaveLength(1);
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(1);
    for (const actor of actors) expect((await page.request.get(`${taskUrl}/attachments/${draft.id}/download`, { headers: actor.headers })).status()).toBe(200);
    const otherTask = await prisma.task.create({ data: { projectId: project.id, title: "Other task", status: "Backlog", position: 1 } });
    expect((await page.request.post(`${prefix}/tasks/${otherTask.id}/comments`, { headers: actors[2].headers, data: { content: "Wrong task", attachmentIds: [files[2].id] } })).status()).toBe(400);
    await prisma.apiCredential.update({ where: { id: actors[2].id! }, data: { revokedAt: new Date() } });
    expect((await page.request.get(`${taskUrl}/attachments/${files[2].id}/download`, { headers: actors[2].headers })).status()).toBe(401);
    expect((await page.request.delete(`${taskUrl}/attachments/${files[2].id}`)).ok()).toBeTruthy();
  } finally {
    for (const file of files) await page.request.delete(`${taskUrl}/attachments/${file.id}`);
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
