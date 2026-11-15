import crypto from "node:crypto";
import { ApiCredentialScope, type Prisma } from "@prisma/client";
import { parseAgentScopes, type AgentScope } from "@/lib/agent-access";
import { issueAgentAccessToken } from "@/lib/auth/agent-token-service";
import { parseAgentCredentialDescriptiveLabels } from "@/lib/agent-credential-labels";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

type Db = Prisma.TransactionClient;
type Failure = { ok: false; status: number; error: string };
const fail = (status = 401, error = "runtime-access-denied"): Failure => ({
  ok: false,
  status,
  error,
});
const success = <T>(data: T, status = 200) => ({
  ok: true as const,
  status,
  data,
});
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const secret = () => crypto.randomBytes(32).toString("base64url");
const text = (v: unknown, max = 80) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const toDb = (scopes: AgentScope[]) =>
  scopes.map((s) => s.replace(":", "_") as ApiCredentialScope);
const fromDb = (scopes: ApiCredentialScope[]) =>
  parseAgentScopes(scopes.map((s) => s.replace("_", ":")));
// Shared databases may contain grants from a newer deployment. Filter before
// Prisma deserializes unknown enum values, as legacy credential reads do.
const supportedScopeGrants = {
  where: { scope: { in: Object.values(ApiCredentialScope) } },
  select: { scope: true },
};
const scopesFrom = (v: unknown) =>
  Array.isArray(v) && v.length > 0 && parseAgentScopes(v).length === v.length
    ? toDb(parseAgentScopes(v))
    : null;
const alive = (v: { revokedAt: Date | null; expiresAt: Date | null }) =>
  !v.revokedAt && (!v.expiresAt || v.expiresAt.getTime() > Date.now());

async function audit(
  db: Db,
  input: { projectId: string; identityId: string; actorUserId: string },
  operation: string,
  details: Prisma.InputJsonObject = {},
  agent = false
) {
  await db.authAuditEvent.create({
    data: {
      projectId: input.projectId,
      credentialId: input.identityId,
      actorUserId: input.actorUserId,
      actorKind: agent ? "agent" : "human",
      action: agent ? "token_exchanged" : "credential_capabilities_updated",
      metadata: { operation, ...details },
    },
  });
}

// ApiCredential remains the stable actor anchor so assignments, mentions and
// snapshots keep their IDs. identityMode anchors never contain a usable API key.
export async function manageAgentIdentities(input: {
  actorUserId: string;
  projectId: string;
  command?: Record<string, unknown>;
}) {
  if (!input.actorUserId.trim()) return fail();
  return withActorRlsContext(
    input.actorUserId,
    async (db) => {
      const access = await requireProjectRole({
        ...input,
        minimumRole: "owner",
        db,
      });
      if (!access.ok) return access;
      const c = input.command;
      if (!c) {
        const records = await db.apiCredential.findMany({
          where: { projectId: input.projectId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            descriptiveLabels: true,
            avatarSeed: true,
            identityMode: true,
            revokedAt: true,
            expiresAt: true,
            canMoveTasksToDone: true,
            scopeGrants: supportedScopeGrants,
            runtimeDevices: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                name: true,
                scopes: true,
                canMoveTasksToDone: true,
                authorizedAt: true,
                pairingExpiresAt: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
                sessions: {
                  orderBy: { createdAt: "desc" },
                  where: {
                    OR: [
                      { endedAt: null, expiresAt: { gt: new Date() } },
                      {
                        createdAt: {
                          gte: new Date(Date.now() - 7 * 86400_000),
                        },
                      },
                    ],
                  },
                  select: {
                    id: true,
                    client: true,
                    createdAt: true,
                    expiresAt: true,
                    endedAt: true,
                    lastActiveAt: true,
                  },
                },
              },
            },
            auditEvents: {
              orderBy: { createdAt: "desc" },
              take: 15,
              select: {
                id: true,
                action: true,
                metadata: true,
                createdAt: true,
              },
            },
          },
        });
        return success({
          identities: records.map((r) => ({
            ...r,
            name: r.label,
            scopes: fromDb(r.scopeGrants.map((g) => g.scope)),
            devices: r.runtimeDevices.map((d) => ({
              ...d,
              scopes: fromDb(d.scopes),
            })),
          })),
        });
      }
      const op = text(c.operation);
      const identityId = text(c.identityId, 128);
      const name = text(c.name);
      const scopes = scopesFrom(c.scopes);
      const descriptiveLabels = parseAgentCredentialDescriptiveLabels(c.descriptiveLabels === undefined ? [] : c.descriptiveLabels);
      if (op === "create") {
        if (!name || !scopes || !descriptiveLabels || typeof c.canMoveTasksToDone !== "boolean")
          return fail(400, "invalid-identity");
        const identity = await db.apiCredential.create({
          data: {
            projectId: input.projectId,
            createdByUserId: input.actorUserId,
            identityMode: true,
            label: name,
            descriptiveLabels,
            avatarSeed: text(c.avatarSeed, 64) || null,
            publicId: `identity_${crypto.randomUUID()}`,
            secretHash: "disabled:runtime-only",
            canMoveTasksToDone: c.canMoveTasksToDone,
            scopeGrants: { create: scopes.map((scope) => ({ scope })) },
          },
          select: { id: true },
        });
        await audit(
          db,
          { ...input, identityId: identity.id },
          "identity_created"
        );
        return success({ identityId: identity.id }, 201);
      }
      const identity = await db.apiCredential.findFirst({
        where: { id: identityId, projectId: input.projectId },
        include: { scopeGrants: supportedScopeGrants },
      });
      if (!identity) return fail(404, "identity-not-found");
      const context = { ...input, identityId };
      if (op === "update") {
        if (!name || !scopes || !descriptiveLabels || typeof c.canMoveTasksToDone !== "boolean")
          return fail(400, "invalid-identity");
        await db.apiCredential.update({
          where: { id: identityId },
          data: {
            label: name,
            descriptiveLabels,
            avatarSeed: text(c.avatarSeed, 64) || null,
            canMoveTasksToDone: c.canMoveTasksToDone,
            scopeGrants: {
              deleteMany: {},
              create: scopes.map((scope) => ({ scope })),
            },
          },
        });
        await audit(db, context, "identity_updated", {
          scopes,
          canMoveTasksToDone: c.canMoveTasksToDone,
        });
      } else if (op === "deactivate") {
        // Keep responsibility and attribution references; deactivation makes the
        // actor inactive, never deletes or silently reassigns its work.
        await db.apiCredential.update({
          where: { id: identityId },
          data: { revokedAt: new Date(), revokedByUserId: input.actorUserId },
        });
        await db.agentRuntimeSession.updateMany({
          where: { device: { identityId }, endedAt: null },
          data: { endedAt: new Date() },
        });
        await audit(db, context, "identity_deactivated");
      } else if (op === "authorize-device") {
        if (
          !alive(identity) ||
          !name ||
          !scopes ||
          typeof c.canMoveTasksToDone !== "boolean" ||
          scopes.some(
            (s) => !identity.scopeGrants.some((g) => g.scope === s)
          ) ||
          (c.canMoveTasksToDone && !identity.canMoveTasksToDone)
        )
          return fail(400, "invalid-device-grants");
        const pairingCode = secret();
        const device = await db.agentRuntimeDevice.create({
          data: {
            identityId,
            authorizedByUserId: input.actorUserId,
            name,
            scopes,
            canMoveTasksToDone: c.canMoveTasksToDone,
            pairingHash: hash(pairingCode),
            pairingExpiresAt: new Date(Date.now() + 10 * 60_000),
            expiresAt: new Date(Date.now() + 90 * 86400_000),
          },
          select: { id: true },
        });
        await audit(db, context, "device_authorized", {
          deviceId: device.id,
          name,
          scopes,
        });
        return success({ deviceId: device.id, pairingCode }, 201);
      } else if (op === "revoke-device") {
        const deviceId = text(c.deviceId, 128);
        const changed = await db.agentRuntimeDevice.updateMany({
          where: { id: deviceId, identityId },
          data: { revokedAt: new Date(), pairingHash: null },
        });
        if (!changed.count) return fail(404, "device-not-found");
        await db.agentRuntimeCredential.updateMany({
          where: { deviceId },
          data: { revokedAt: new Date() },
        });
        await db.agentRuntimeSession.updateMany({
          where: { deviceId, endedAt: null },
          data: { endedAt: new Date() },
        });
        await audit(db, context, "device_revoked", { deviceId });
      } else if (op === "end-session") {
        const sessionId = text(c.sessionId, 128);
        const changed = await db.agentRuntimeSession.updateMany({
          where: { id: sessionId, device: { identityId } },
          data: { endedAt: new Date() },
        });
        if (!changed.count) return fail(404, "session-not-found");
        await audit(db, context, "session_ended", { sessionId });
      } else return fail(400, "invalid-operation");
      return success({ updated: true });
    },
    { forceTransaction: true }
  );
}

// The security-definer lookup accepts only a 256-bit proof hash and returns the
// minimum binding needed to establish an owner RLS transaction. No list access.
async function resolveRuntimeProof(proof: string, pairing: boolean) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(proof)) return null;
  const rows = await prisma.$queryRaw<
    Array<{ device_id: string; owner_id: string }>
  >`
    SELECT * FROM app.resolve_agent_runtime_proof(${hash(proof)}, ${pairing})
  `;
  return rows[0] ?? null;
}

export async function exchangeRuntimeAccess(input: Record<string, unknown>) {
  const operation = text(input.operation);
  const pairing = operation === "pair";
  if (!["pair", "start", "renew", "end"].includes(operation))
    return fail(400, "invalid-operation");
  const proof = text(input.proof, 128);
  const binding = await resolveRuntimeProof(proof, pairing);
  if (!binding) return fail();
  return withActorRlsContext(
    binding.owner_id,
    async (db) => {
      const device = await db.agentRuntimeDevice.findUnique({
        where: { id: binding.device_id },
        include: {
          identity: {
            include: {
              scopeGrants: supportedScopeGrants,
              project: { select: { ownerId: true } },
            },
          },
        },
      });
      if (
        !device ||
        !alive(device) ||
        !alive(device.identity) ||
        device.identity.project.ownerId !== binding.owner_id ||
        device.authorizedByUserId !== binding.owner_id ||
        device.identity.id !== input.identityId ||
        device.identity.projectId !== input.projectId
      )
        return fail();
      const identity = device.identity;
      const context = {
        projectId: identity.projectId,
        identityId: identity.id,
        actorUserId: binding.owner_id,
      };
      if (pairing) {
        const consumed = await db.agentRuntimeDevice.updateMany({
          where: {
            id: device.id,
            pairingHash: hash(proof),
            pairingExpiresAt: { gt: new Date() },
            authorizedAt: null,
            revokedAt: null,
          },
          data: { pairingHash: null, authorizedAt: new Date() },
        });
        if (consumed.count !== 1) return fail();
        const runtimeCredential = secret();
        await db.agentRuntimeCredential.create({
          data: {
            deviceId: device.id,
            tokenHash: hash(runtimeCredential),
            expiresAt: device.expiresAt,
          },
        });
        await audit(
          db,
          context,
          "device_paired",
          { deviceId: device.id },
          true
        );
        return success({
          runtimeCredential,
          deviceId: device.id,
          identityId: identity.id,
          projectId: identity.projectId,
        });
      }
      const credential = await db.agentRuntimeCredential.findFirst({
        where: {
          deviceId: device.id,
          tokenHash: hash(proof),
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!credential || !device.authorizedAt) return fail();
      const currentScopes = device.scopes.filter((s) =>
        identity.scopeGrants.some((g) => g.scope === s)
      );
      if (!currentScopes.length) return fail(403, "runtime-permissions-empty");
      let session;
      if (operation === "start") {
        const client = text(input.client);
        if (!client || input.sessionId != null)
          return fail(400, "invalid-session-binding");
        session = await db.agentRuntimeSession.create({
          data: {
            deviceId: device.id,
            client,
            scopes: currentScopes,
            canMoveTasksToDone:
              identity.canMoveTasksToDone && device.canMoveTasksToDone,
            expiresAt: new Date(
              Math.min(
                Date.now() + 12 * 3600_000,
                device.expiresAt.getTime(),
                credential.expiresAt.getTime()
              )
            ),
          },
        });
      } else {
        session = await db.agentRuntimeSession.findFirst({
          where: {
            id: text(input.sessionId, 128),
            deviceId: device.id,
            endedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (!session) return fail();
      }
      if (operation === "end") {
        await db.agentRuntimeSession.update({
          where: { id: session.id },
          data: { endedAt: new Date() },
        });
        await audit(
          db,
          context,
          "session_ended",
          {
            sessionId: session.id,
            deviceId: device.id,
            client: session.client,
          },
          true
        );
        return success({ ended: true });
      }
      const scopes = fromDb(
        currentScopes.filter((s) => session.scopes.includes(s))
      );
      if (!scopes.length) return fail(403, "runtime-permissions-empty");
      const token = issueAgentAccessToken({
        credentialId: identity.id,
        credentialPublicId: identity.publicId,
        ownerUserId: binding.owner_id,
        projectId: identity.projectId,
        scopes,
        sessionId: session.id,
        deviceId: device.id,
        ttlSeconds: Math.min(
          300,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
        ),
      });
      await audit(
        db,
        context,
        operation === "start" ? "session_started" : "session_renewed",
        {
          sessionId: session.id,
          deviceId: device.id,
          client: session.client,
          tokenId: token.tokenId,
        },
        true
      );
      return success({
        accessToken: token.accessToken,
        expiresInSeconds: token.expiresInSeconds,
        sessionId: session.id,
        deviceId: device.id,
        identityId: identity.id,
        projectId: identity.projectId,
        scopes,
        identityName: identity.label,
        descriptiveLabels: identity.descriptiveLabels,
        sessionExpiresAt: session.expiresAt.toISOString(),
        deviceExpiresAt: device.expiresAt.toISOString(),
        canMoveTasksToDone:
          scopes.includes("task:write") && identity.canMoveTasksToDone &&
          device.canMoveTasksToDone && session.canMoveTasksToDone,
      });
    },
    { forceTransaction: true }
  );
}

export async function validateRuntimeRequest(input: {
  credentialId: string;
  projectId: string;
  ownerUserId: string;
  sessionId: string;
  deviceId: string;
  scopes: AgentScope[];
}) {
  return withActorRlsContext(input.ownerUserId, async (db) => {
    const session = await db.agentRuntimeSession.findFirst({
      where: {
        id: input.sessionId,
        deviceId: input.deviceId,
        endedAt: null,
        expiresAt: { gt: new Date() },
        device: { identityId: input.credentialId },
      },
      include: {
        device: {
          include: {
            credentials: {
              where: { revokedAt: null, expiresAt: { gt: new Date() } },
              select: { id: true },
              take: 1,
            },
            identity: {
              include: {
                scopeGrants: supportedScopeGrants,
                project: { select: { ownerId: true } },
              },
            },
          },
        },
      },
    });
    if (
      !session ||
      !alive(session.device) ||
      !session.device.authorizedAt ||
      !session.device.credentials.length ||
      !alive(session.device.identity) ||
      session.device.identity.projectId !== input.projectId ||
      session.device.authorizedByUserId !== input.ownerUserId ||
      session.device.identity.project.ownerId !== input.ownerUserId
    )
      return fail();
    const identity = session.device.identity;
    const scopes = input.scopes.filter((s) => {
      const scope = toDb([s])[0];
      return (
        session.scopes.includes(scope) &&
        session.device.scopes.includes(scope) &&
        identity.scopeGrants.some((g) => g.scope === scope)
      );
    });
    if (!scopes.length) return fail(403, "runtime-permissions-empty");
    await db.agentRuntimeSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
    return success({
      scopes,
      canMoveTasksToDone:
        identity.canMoveTasksToDone &&
        session.device.canMoveTasksToDone &&
        session.canMoveTasksToDone,
      client: session.client,
      deviceName: session.device.name,
    });
  });
}
