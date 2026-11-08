import { mock } from "node:test";
import crypto from "node:crypto";
import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { getAgentTokenRuntimeConfig } from "../../lib/env.server";
import { issueAgentAccessToken, verifyAgentAccessToken } from "../../lib/auth/agent-token-service";
import {
  createProjectAgentCredential,
  exchangeAgentApiKeyForAccessToken,
  recordAgentRequestUsage,
  rotateProjectAgentCredential,
} from "../../lib/services/project-agent-access-service";

// Run the real exchange, rotation, signature verification, and atomic usage
// query against PostgreSQL. Only Date is frozen; I/O and timers run normally.
for (const milliseconds of [0, 1, 999]) {
  test(`ND-657: immediate rotation and invalidation at millisecond ${milliseconds}`, async () => {
    const now = Date.UTC(2026, 10, 8, 12, 0, 0, milliseconds);
    mock.timers.enable({ apis: ["Date"], now });
    let ownerId: string | undefined;
    let projectId: string | undefined;
    try {
      const owner = await prisma.user.create({ data: { name: "ND-657 rotation owner" } });
      ownerId = owner.id;
      const project = await prisma.project.create({ data: {
        name: "ND-657 rotation regression", ownerId,
        memberships: { create: { userId: ownerId, role: "owner" } },
      } });
      projectId = project.id;
      const exchange = async (apiKey: string) => {
        const result = await exchangeAgentApiKeyForAccessToken({ apiKey });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        return result.data.accessToken;
      };
      const authorizeToken = async (accessToken: string) => {
        const verified = verifyAgentAccessToken(accessToken);
        if (!verified.ok) return verified;
        return recordAgentRequestUsage({ ...verified.data, path: `/api/projects/${projectId}/tasks` });
      };
      const created = await createProjectAgentCredential({
        actorUserId: ownerId, projectId, label: "Rotation test", scopes: ["task:read"], expiresInDays: null,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error);
      const credentialId = created.data.credential.id;
      const originalToken = await exchange(created.data.apiKey);
      expect((await authorizeToken(originalToken)).ok).toBe(true);

      // A legacy token is accepted before the first rotation, and never after it.
      const [header, encoded] = originalToken.split(".");
      const legacyPayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      delete legacyPayload.credentialPublicId;
      const unsigned = `${header}.${Buffer.from(JSON.stringify(legacyPayload)).toString("base64url")}`;
      const signature = crypto.createHmac("sha256", getAgentTokenRuntimeConfig().signingSecret)
        .update(unsigned).digest("base64url");
      const legacyToken = `${unsigned}.${signature}`;
      expect((await authorizeToken(legacyToken)).ok).toBe(true);

      let previousKey = created.data.apiKey;
      const staleTokens = [originalToken, legacyToken];
      for (let rotation = 0; rotation < 2; rotation++) {
        const rotated = await rotateProjectAgentCredential({ actorUserId: ownerId, projectId, credentialId });
        expect(rotated.ok).toBe(true);
        if (!rotated.ok) throw new Error(rotated.error);
        expect(rotated.data.credential.lastRotatedAt).toBe(new Date(now).toISOString());
        const token = await exchange(rotated.data.apiKey);
        expect((await authorizeToken(token)).ok).toBe(true);
        for (const stale of staleTokens) {
          expect(await authorizeToken(stale)).toMatchObject({ ok: false, status: 401 });
        }
        expect(await exchangeAgentApiKeyForAccessToken({ apiKey: previousKey }))
          .toMatchObject({ ok: false, status: 401 });
        previousKey = rotated.data.apiKey;
        staleTokens.push(token);
      }

      // An exchange that captured the old key before rotation cannot gain
      // access by finishing (and issuing its token) after the rotation.
      mock.timers.setTime(now + 1);
      const raced = issueAgentAccessToken({
        credentialId, credentialPublicId: created.data.credential.publicId,
        projectId, ownerUserId: ownerId, scopes: ["task:read"],
      });
      expect(await authorizeToken(raced.accessToken)).toMatchObject({ ok: false, status: 401 });

      const currentToken = staleTokens.at(-1)!;
      await prisma.apiCredential.update({ where: { id: credentialId }, data: { expiresAt: new Date(now) } });
      expect(await authorizeToken(currentToken)).toMatchObject({ ok: false, status: 401 });
      expect(await exchangeAgentApiKeyForAccessToken({ apiKey: previousKey }))
        .toMatchObject({ ok: false, status: 401 });
      await prisma.apiCredential.update({ where: { id: credentialId }, data: { expiresAt: null, revokedAt: new Date(now) } });
      expect(await authorizeToken(currentToken)).toMatchObject({ ok: false, status: 401 });
      expect(await exchangeAgentApiKeyForAccessToken({ apiKey: previousKey }))
        .toMatchObject({ ok: false, status: 401 });
    } finally {
      mock.timers.reset();
      if (projectId) await prisma.project.delete({ where: { id: projectId } });
      if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    }
  });
}
