import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { saveAttachmentFile } from "../../lib/attachment-storage";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("task links and files preserve their actual uploader through credential deletion", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd669"), ownerId: userId, memberships: { create: { userId, role: "owner" } } } });
  const prefix = `/api/projects/${project.id}`;
  let fileId: string | undefined;
  let taskId: string | undefined;
  try {
    const agents = [];
    for (const label of ["Upload A", "Upload B"]) {
      const response = await page.request.post(`${prefix}/agent-access`, { data: { label, scopes: ["task:read", "task:write"] } });
      expect(response.status()).toBe(201);
      const credential = await response.json();
      const token = await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } });
      expect(token.ok()).toBeTruthy();
      agents.push({ id: credential.credential.id, headers: { Authorization: `Bearer ${(await token.json()).accessToken}` } });
    }
    const created = await page.request.post(`${prefix}/tasks`, { headers: agents[0].headers, data: { title: "Uploader regression", attachmentLinks: [{ name: "A", url: "https://example.com/a" }] } });
    expect(created.status()).toBe(201);
    taskId = (await created.json()).taskId;
    const taskUrl = `${prefix}/tasks/${taskId}`;
    const appended = await page.request.patch(taskUrl, { headers: agents[1].headers, data: { attachmentLinks: [{ name: "B", url: "https://example.com/b" }] } });
    expect(appended.ok()).toBeTruthy();
    const bytes = Buffer.from("Task uploader evidence\n");
    const metadata = { name: "evidence.txt", mimeType: "text/plain", sizeBytes: bytes.length };
    const target = await page.request.post(`${taskUrl}/attachments/upload-url`, { headers: agents[0].headers, data: metadata });
    let storageKey: string;
    if (target.ok()) {
      const { upload } = await target.json();
      storageKey = upload.storageKey;
      expect((await page.request.put(upload.uploadUrl, { headers: upload.headers, data: bytes })).ok()).toBeTruthy();
    } else {
      expect(process.env.PLAYWRIGHT_BASE_URL).toBeFalsy();
      expect(target.status()).toBe(400);
      storageKey = (await saveAttachmentFile({ scope: "task", actorUserId: userId, projectId: project.id, ownerId: `${taskId}/actors/agent/${agents[0].id}`, file: new File([bytes], metadata.name, { type: metadata.mimeType }) })).storageKey;
    }
    const uploaded = await page.request.post(`${taskUrl}/attachments/direct`, { headers: agents[0].headers, data: { ...metadata, storageKey } });
    expect(uploaded.ok()).toBeTruthy();
    const attachment = (await uploaded.json()).attachment;
    fileId = attachment.id;
    expect(attachment.uploadedBy).toEqual({ kind: "agent", id: agents[0].id, displayName: "Upload A" });
    expect(await (await page.request.get(attachment.downloadUrl, { headers: agents[0].headers })).body()).toEqual(bytes);
    let task = (await (await page.request.get(taskUrl)).json()).task;
    expect(task.attachments.find((a: { name: string }) => a.name === "A").uploadedBy.id).toBe(agents[0].id);
    expect(task.attachments.find((a: { name: string }) => a.name === "B").uploadedBy.id).toBe(agents[1].id);
    expect(task.updatedBy.agentCredentialId).toBe(agents[0].id);
    await prisma.apiCredential.update({ where: { id: agents[0].id }, data: { revokedAt: new Date() } });
    await prisma.apiCredential.delete({ where: { id: agents[0].id } });
    task = (await (await page.request.get(taskUrl)).json()).task;
    expect(task.attachments.find((a: { id: string }) => a.id === fileId).uploadedBy).toEqual({ kind: "agent", id: null, displayName: "Upload A" });
    await page.goto(`/projects/${project.id}?taskId=${taskId}#kanban`);
    await expect(page.getByText("Added by Upload A (agent)").first()).toBeVisible();
    expect((await page.request.delete(`${taskUrl}/attachments/${fileId}`)).ok()).toBeTruthy();
    fileId = undefined;
    task = (await (await page.request.get(taskUrl)).json()).task;
    expect(task.updatedBy.kind).toBe("user");
  } finally {
    try { if (fileId && taskId) await page.request.delete(`${prefix}/tasks/${taskId}/attachments/${fileId}`); }
    finally { await prisma.project.delete({ where: { id: project.id } }); await prisma.user.delete({ where: { id: userId } }); }
  }
});
