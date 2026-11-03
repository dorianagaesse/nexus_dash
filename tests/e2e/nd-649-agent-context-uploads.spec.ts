import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { saveAttachmentFile } from "../../lib/attachment-storage";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("agent context attachments retain credential identity through revocation and deletion", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("nd649-uploads"), ownerId: userId,
    memberships: { create: { userId, role: "owner" } },
  } });
  const prefix = `/api/projects/${project.id}`;
  let storageKey: string | undefined;
  let cleanupUrl: string | undefined;
  try {
    const credentialResponse = await page.request.post(`${prefix}/agent-access`, { data: {
      label: "TellmetrY upload agent", scopes: ["context:read", "context:write"],
    } });
    expect(credentialResponse.status()).toBe(201);
    const credential = await credentialResponse.json();
    const exchanged = await page.request.post("/api/auth/agent/token", {
      headers: { Authorization: `ApiKey ${credential.apiKey}` },
    });
    expect(exchanged.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await exchanged.json()).accessToken}` };
    const created = await page.request.post(`${prefix}/context-cards`, { headers, data: {
      title: "Agent upload regression", content: "<p>Context from the agent</p>", color: "#FDE2E4",
      attachmentLinks: [{ name: "Reference", url: "https://example.com/spec" }],
    } });
    expect(created.status()).toBe(201);
    const body = await created.json();
    const cardId = body.card?.id ?? body.id;
    const attachmentsUrl = `${prefix}/context-cards/${cardId}/attachments`;
    cleanupUrl = `${attachmentsUrl}/direct/cleanup`;
    const bytes = Buffer.from("Agent context file\n");
    const metadata = { name: "agent-context.txt", mimeType: "text/plain", sizeBytes: bytes.length };
    const target = await page.request.post(`${attachmentsUrl}/upload-url`, { headers, data: metadata });
    if (target.ok()) {
      const { upload } = await target.json();
      storageKey = upload.storageKey;
      const put = await page.request.put(upload.uploadUrl, { headers: upload.headers, data: bytes });
      expect(put.ok()).toBeTruthy();
    } else {
      // Local storage has no signed PUT endpoint; seed the same stored bytes.
      expect(process.env.PLAYWRIGHT_BASE_URL).toBeFalsy();
      expect(target.status()).toBe(400);
      expect((await target.json()).error).toBe("Direct upload is not available for the current storage provider.");
      storageKey = (await saveAttachmentFile({ scope: "context-card", actorUserId: userId, projectId: project.id,
        ownerId: cardId, file: new File([bytes], metadata.name, { type: metadata.mimeType }) })).storageKey;
    }
    const finalized = await page.request.post(`${attachmentsUrl}/direct`, { headers, data: { ...metadata, storageKey } });
    expect(finalized.status()).toBe(200);
    const attachment = (await finalized.json()).attachment;
    const download = await page.request.get(attachment.downloadUrl, { headers });
    expect(download.ok()).toBeTruthy();
    expect(await download.body()).toEqual(bytes);
    const readAttachments = async () => {
      const read = await page.request.get(`${prefix}/context-cards/${cardId}`);
      expect(read.ok()).toBeTruthy();
      return (await read.json()).card.projection.attachments;
    };
    const uploaded = await readAttachments();
    expect(uploaded).toHaveLength(2);
    for (const item of uploaded) {
      expect(item.uploadedBy).toMatchObject({ kind: "agent", id: credential.credential.id, displayName: "TellmetrY upload agent", status: "active" });
    }
    await prisma.apiCredential.update({ where: { id: credential.credential.id }, data: { revokedAt: new Date() } });
    for (const item of await readAttachments()) expect(item.uploadedBy.status).toBe("revoked");
    await prisma.apiCredential.delete({ where: { id: credential.credential.id } });
    for (const item of await readAttachments()) {
      expect(item.uploadedBy).toMatchObject({ kind: "agent", displayName: "TellmetrY upload agent", status: "revoked" });
      expect(item.uploadedBy.id).not.toBe(userId);
    }
  } finally {
    try {
      if (storageKey && cleanupUrl) {
        const cleanup = await page.request.post(cleanupUrl, { data: { storageKey } });
        expect(cleanup.ok()).toBeTruthy();
      }
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
