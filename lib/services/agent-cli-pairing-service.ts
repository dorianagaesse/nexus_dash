import crypto from "node:crypto";
import { ApiCredentialScope, type Prisma } from "@prisma/client";

import { parseAgentScopes, type AgentScope } from "@/lib/agent-access";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

type Db = Prisma.TransactionClient;

type ServiceFailure = { ok: false; status: number; error: string };
type ServiceSuccess<T> = { ok: true; status: number; data: T };
export type ServiceResult<T> = ServiceFailure | ServiceSuccess<T>;

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_TTL_MS = 10 * 60_000;
const INSTALLATION_TTL_MS = 90 * 86_400_000;
const POLL_INTERVAL_SECONDS = 2;

const fail = (status: number, error: string): ServiceFailure => ({
  ok: false,
  status,
  error,
});

const success = <T>(data: T, status = 200): ServiceSuccess<T> => ({
  ok: true,
  status,
  data,
});

const sha256Hex = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const randomSecret = (): string => crypto.randomBytes(32).toString("base64url");

const boundedText = (value: unknown, max = 80): string =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";

const toDbScopes = (scopes: AgentScope[]): ApiCredentialScope[] =>
  scopes.map((scope) => scope.replace(":", "_") as ApiCredentialScope);

const fromDbScopes = (scopes: ApiCredentialScope[]): AgentScope[] =>
  parseAgentScopes(scopes.map((scope) => scope.replace("_", ":")));

const parseRequestedScopes = (value: unknown): ApiCredentialScope[] | null =>
  Array.isArray(value) &&
  value.length > 0 &&
  parseAgentScopes(value).length === value.length
    ? toDbScopes(parseAgentScopes(value))
    : null;

const supportedScopeGrants = {
  where: { scope: { in: Object.values(ApiCredentialScope) } },
  select: { scope: true },
};

const isAlive = (record: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean =>
  !record.revokedAt &&
  (!record.expiresAt || record.expiresAt.getTime() > Date.now());

export function generateCliUserCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let index = 0; index < 8; index += 1) {
    raw += USER_CODE_ALPHABET[bytes[index]! % USER_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeCliUserCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const stripped = raw.replace(/[\s-]+/g, "").toUpperCase();
  if (stripped.length !== 8) {
    return null;
  }
  for (const char of stripped) {
    if (!USER_CODE_ALPHABET.includes(char)) {
      return null;
    }
  }
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
}

async function lockProjectOwner(
  db: Db,
  projectId: string,
  ownerId: string
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Project" WHERE id = ${projectId} AND "ownerId" = ${ownerId}
    FOR SHARE
  `;
  return rows.length === 1;
}

export interface OwnedAgentIdentityOption {
  id: string;
  name: string;
  descriptiveLabels: string[];
  identityMode: boolean;
  scopes: AgentScope[];
  canMoveTasksToDone: boolean;
  pairedDeviceCount: number;
}

export interface OwnedProjectForCliApproval {
  id: string;
  name: string;
  identities: OwnedAgentIdentityOption[];
}

export interface ApprovedCliGrantSummary {
  projectId: string;
  projectName: string;
  identityId: string;
  identityName: string;
  descriptiveLabels: string[];
  deviceId: string;
  deviceName: string;
  scopes: AgentScope[];
  canMoveTasksToDone: boolean;
  deviceExpiresAt: string;
}

export interface CliPairingInspectionView {
  state:
    | "code-required"
    | "invalid-code"
    | "not-found"
    | "expired"
    | "denied"
    | "already-approved"
    | "ready";
  userCode: string | null;
  request: {
    id: string;
    requestedDeviceName: string;
    requestedProjectId: string | null;
    requestedIdentityId: string | null;
    expiresAt: string;
  } | null;
  approvedGrant: ApprovedCliGrantSummary | null;
  ownedProjects: OwnedProjectForCliApproval[];
}

export async function beginAgentCliPairing(
  input: Record<string, unknown>
): Promise<
  ServiceResult<{
    requestId: string;
    userCode: string;
    pollSecret: string;
    authorizePath: string;
    expiresAt: string;
    intervalSeconds: number;
  }>
> {
  const installSecretHash = boundedText(input.installSecretHash, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(installSecretHash)) {
    return fail(400, "invalid-install-secret-hash");
  }

  const requestedDeviceName = boundedText(input.deviceName, 80);
  if (!requestedDeviceName) {
    return fail(400, "invalid-device-name");
  }

  const requestedProjectId =
    input.projectId === undefined || input.projectId === null
      ? null
      : boundedText(input.projectId, 128) || null;
  const requestedIdentityId =
    input.identityId === undefined || input.identityId === null
      ? null
      : boundedText(input.identityId, 128) || null;

  const existingCredential = await prisma.agentRuntimeCredential.findUnique({
    where: { tokenHash: installSecretHash },
    select: { id: true },
  });
  if (existingCredential) {
    return fail(409, "install-secret-conflict");
  }

  const pollSecret = randomSecret();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = generateCliUserCode();
    try {
      const created = await prisma.agentCliPairingRequest.create({
        data: {
          userCodeHash: sha256Hex(userCode),
          pollSecretHash: sha256Hex(pollSecret),
          installSecretHash,
          requestedDeviceName,
          requestedProjectId,
          requestedIdentityId,
          expiresAt,
        },
        select: { id: true },
      });

      return success(
        {
          requestId: created.id,
          userCode,
          pollSecret,
          authorizePath: `/cli/authorize?code=${encodeURIComponent(userCode)}`,
          expiresAt: expiresAt.toISOString(),
          intervalSeconds: POLL_INTERVAL_SECONDS,
        },
        201
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002" && attempt < 4) {
        const duplicateInstall = await prisma.agentCliPairingRequest.findUnique({
          where: { installSecretHash },
          select: { id: true },
        });
        if (duplicateInstall) {
          return fail(409, "install-secret-conflict");
        }
        continue;
      }
      throw error;
    }
  }

  return fail(503, "pairing-code-unavailable");
}

async function listOwnedProjectsForApproval(
  actorUserId: string
): Promise<OwnedProjectForCliApproval[]> {
  return withActorRlsContext(actorUserId, async (db) => {
    const projects = await db.project.findMany({
      where: { ownerId: actorUserId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        apiCredentials: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            descriptiveLabels: true,
            identityMode: true,
            revokedAt: true,
            expiresAt: true,
            canMoveTasksToDone: true,
            scopeGrants: supportedScopeGrants,
            runtimeDevices: {
              select: {
                authorizedAt: true,
                revokedAt: true,
                expiresAt: true,
              },
            },
          },
        },
      },
    });

    const now = Date.now();
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      identities: project.apiCredentials
        .filter((credential) => isAlive(credential))
        .map((credential) => {
          const scopes = fromDbScopes(
            credential.scopeGrants.map((grant) => grant.scope)
          );
          const pairedDeviceCount = credential.runtimeDevices.filter(
            (device) =>
              Boolean(device.authorizedAt) &&
              !device.revokedAt &&
              device.expiresAt.getTime() > now
          ).length;
          return {
            id: credential.id,
            name: credential.label,
            descriptiveLabels: credential.descriptiveLabels,
            identityMode: credential.identityMode,
            scopes,
            canMoveTasksToDone: credential.canMoveTasksToDone,
            pairedDeviceCount,
          };
        })
        .filter((identity) => identity.scopes.length > 0),
    }));
  });
}

async function readApprovedGrantSummaryForOwner(
  ownerUserId: string,
  deviceId: string
): Promise<ApprovedCliGrantSummary | null> {
  return withActorRlsContext(ownerUserId, async (db) => {
    const device = await db.agentRuntimeDevice.findUnique({
      where: { id: deviceId },
      include: {
        identity: {
          include: {
            scopeGrants: supportedScopeGrants,
            project: { select: { id: true, name: true, ownerId: true } },
          },
        },
      },
    });
    if (
      !device ||
      !isAlive(device) ||
      !isAlive(device.identity) ||
      device.authorizedByUserId !== ownerUserId ||
      device.identity.project.ownerId !== ownerUserId
    ) {
      return null;
    }

    const effectiveScopes = fromDbScopes(
      device.scopes.filter((scope) =>
        device.identity.scopeGrants.some((grant) => grant.scope === scope)
      )
    );
    return {
      projectId: device.identity.project.id,
      projectName: device.identity.project.name,
      identityId: device.identity.id,
      identityName: device.identity.label,
      descriptiveLabels: device.identity.descriptiveLabels,
      deviceId: device.id,
      deviceName: device.name,
      scopes: effectiveScopes,
      canMoveTasksToDone:
        effectiveScopes.includes("task:write") &&
        device.identity.canMoveTasksToDone &&
        device.canMoveTasksToDone,
      deviceExpiresAt: device.expiresAt.toISOString(),
    };
  });
}

export async function inspectAgentCliPairingForUser(input: {
  actorUserId: string;
  rawCode: string | null | undefined;
}): Promise<CliPairingInspectionView> {
  const ownedProjects = input.actorUserId.trim()
    ? await listOwnedProjectsForApproval(input.actorUserId)
    : [];

  if (!input.rawCode || !input.rawCode.trim()) {
    return {
      state: "code-required",
      userCode: null,
      request: null,
      approvedGrant: null,
      ownedProjects,
    };
  }

  const normalizedCode = normalizeCliUserCode(input.rawCode);
  if (!normalizedCode) {
    return {
      state: "invalid-code",
      userCode: null,
      request: null,
      approvedGrant: null,
      ownedProjects,
    };
  }

  const record = await prisma.agentCliPairingRequest.findUnique({
    where: { userCodeHash: sha256Hex(normalizedCode) },
  });

  if (!record) {
    return {
      state: "not-found",
      userCode: normalizedCode,
      request: null,
      approvedGrant: null,
      ownedProjects,
    };
  }

  if (record.deniedAt) {
    return {
      state: "denied",
      userCode: normalizedCode,
      request: null,
      approvedGrant: null,
      ownedProjects,
    };
  }

  if (record.approvedAt) {
    const approvedGrant =
      record.approvedByUserId === input.actorUserId && record.approvedDeviceId
        ? await readApprovedGrantSummaryForOwner(
            input.actorUserId,
            record.approvedDeviceId
          )
        : null;
    return {
      state: "already-approved",
      userCode: normalizedCode,
      request: null,
      approvedGrant,
      ownedProjects,
    };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    return {
      state: "expired",
      userCode: normalizedCode,
      request: null,
      approvedGrant: null,
      ownedProjects,
    };
  }

  return {
    state: "ready",
    userCode: normalizedCode,
    request: {
      id: record.id,
      requestedDeviceName: record.requestedDeviceName,
      requestedProjectId: record.requestedProjectId,
      requestedIdentityId: record.requestedIdentityId,
      expiresAt: record.expiresAt.toISOString(),
    },
    approvedGrant: null,
    ownedProjects,
  };
}

export async function respondToAgentCliPairing(input: {
  actorUserId: string;
  command: Record<string, unknown>;
}): Promise<
  ServiceResult<
    | { decision: "denied" }
    | ({ decision: "approved" } & ApprovedCliGrantSummary)
  >
> {
  if (!input.actorUserId.trim()) {
    return fail(401, "unauthorized");
  }

  const normalizedCode = normalizeCliUserCode(input.command.code);
  if (!normalizedCode) {
    return fail(400, "invalid-pairing-code");
  }

  const decision = boundedText(input.command.decision, 16);
  if (decision !== "approve" && decision !== "deny") {
    return fail(400, "invalid-decision");
  }

  const request = await prisma.agentCliPairingRequest.findUnique({
    where: { userCodeHash: sha256Hex(normalizedCode) },
  });
  if (!request) {
    return fail(404, "pairing-not-found");
  }
  if (request.deniedAt) {
    return fail(409, "pairing-denied");
  }
  if (request.approvedAt) {
    return fail(409, "pairing-already-approved");
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    return fail(410, "pairing-expired");
  }

  if (decision === "deny") {
    const updated = await prisma.agentCliPairingRequest.updateMany({
      where: {
        id: request.id,
        approvedAt: null,
        deniedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { deniedAt: new Date() },
    });
    if (updated.count !== 1) {
      return fail(409, "pairing-state-changed");
    }
    return success({ decision: "denied" });
  }

  const projectId = boundedText(input.command.projectId, 128);
  const identityId = boundedText(input.command.identityId, 128);
  const deviceName = boundedText(input.command.deviceName, 80);
  const scopes = parseRequestedScopes(input.command.scopes);
  const canMoveTasksToDone = input.command.canMoveTasksToDone;

  if (
    !projectId ||
    !identityId ||
    !deviceName ||
    !scopes ||
    typeof canMoveTasksToDone !== "boolean"
  ) {
    return fail(400, "invalid-approval-grants");
  }

  try {
    return await withActorRlsContext(
      input.actorUserId,
      async (db) => {
        const access = await requireProjectRole({
          actorUserId: input.actorUserId,
          projectId,
          minimumRole: "owner",
          db,
        });
        if (!access.ok) {
          return access;
        }
        if (!(await lockProjectOwner(db, projectId, input.actorUserId))) {
          return fail(403, "forbidden");
        }

        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true, name: true, ownerId: true },
        });
        if (!project || project.ownerId !== input.actorUserId) {
          return fail(403, "forbidden");
        }

        const identity = await db.apiCredential.findFirst({
          where: { id: identityId, projectId },
          include: { scopeGrants: supportedScopeGrants },
        });
        if (!identity) {
          return fail(404, "identity-not-found");
        }
        if (
          !isAlive(identity) ||
          scopes.some(
            (scope) => !identity.scopeGrants.some((grant) => grant.scope === scope)
          ) ||
          (canMoveTasksToDone && !identity.canMoveTasksToDone)
        ) {
          return fail(400, "invalid-device-grants");
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + INSTALLATION_TTL_MS);
        const device = await db.agentRuntimeDevice.create({
          data: {
            identityId: identity.id,
            authorizedByUserId: input.actorUserId,
            name: deviceName,
            scopes,
            canMoveTasksToDone,
            pairingHash: null,
            pairingExpiresAt: now,
            authorizedAt: now,
            expiresAt,
          },
          select: { id: true },
        });

        await db.agentRuntimeCredential.create({
          data: {
            deviceId: device.id,
            tokenHash: request.installSecretHash,
            expiresAt,
          },
        });

        const claimed = await db.agentCliPairingRequest.updateMany({
          where: {
            id: request.id,
            approvedAt: null,
            deniedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            approvedAt: now,
            approvedByUserId: input.actorUserId,
            approvedDeviceId: device.id,
          },
        });
        if (claimed.count !== 1) {
          throw new Error("CLI_PAIRING_STATE_CHANGED");
        }

        await db.authAuditEvent.create({
          data: {
            projectId,
            credentialId: identity.id,
            actorUserId: input.actorUserId,
            actorKind: "human",
            action: "credential_capabilities_updated",
            metadata: {
              operation: "cli_installation_approved",
              deviceId: device.id,
              deviceName,
              scopes,
              canMoveTasksToDone,
            },
          },
        });

        const effectiveScopes = fromDbScopes(scopes);
        return success({
          decision: "approved" as const,
          projectId,
          projectName: project.name,
          identityId: identity.id,
          identityName: identity.label,
          descriptiveLabels: identity.descriptiveLabels,
          deviceId: device.id,
          deviceName,
          scopes: effectiveScopes,
          canMoveTasksToDone:
            effectiveScopes.includes("task:write") &&
            identity.canMoveTasksToDone &&
            canMoveTasksToDone,
          deviceExpiresAt: expiresAt.toISOString(),
        });
      },
      { forceTransaction: true }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CLI_PAIRING_STATE_CHANGED"
    ) {
      return fail(409, "pairing-state-changed");
    }
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return fail(409, "install-secret-conflict");
    }
    throw error;
  }
}

export async function pollAgentCliPairing(
  input: Record<string, unknown>
): Promise<
  ServiceResult<
    | { status: "pending"; expiresAt: string }
    | ({ status: "approved" } & ApprovedCliGrantSummary)
  >
> {
  const requestId = boundedText(input.requestId, 128);
  const pollSecret = boundedText(input.pollSecret, 128);
  if (!requestId || !/^[A-Za-z0-9_-]{43}$/.test(pollSecret)) {
    return fail(401, "pairing-access-denied");
  }

  const request = await prisma.agentCliPairingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.pollSecretHash !== sha256Hex(pollSecret)) {
    return fail(401, "pairing-access-denied");
  }
  if (request.deniedAt) {
    return fail(403, "pairing-denied");
  }
  if (!request.approvedAt) {
    if (request.expiresAt.getTime() <= Date.now()) {
      return fail(410, "pairing-expired");
    }
    return success({
      status: "pending",
      expiresAt: request.expiresAt.toISOString(),
    });
  }
  if (request.deliveredAt) {
    return fail(409, "pairing-already-completed");
  }
  if (!request.approvedByUserId || !request.approvedDeviceId) {
    return fail(401, "pairing-access-denied");
  }

  const approvedByUserId = request.approvedByUserId;
  const approvedDeviceId = request.approvedDeviceId;

  const grant = await readApprovedGrantSummaryForOwner(
    approvedByUserId,
    approvedDeviceId
  );
  if (!grant) {
    return fail(401, "pairing-access-denied");
  }

  const delivered = await prisma.agentCliPairingRequest.updateMany({
    where: {
      id: request.id,
      deliveredAt: null,
      approvedAt: { not: null },
    },
    data: { deliveredAt: new Date() },
  });
  if (delivered.count !== 1) {
    return fail(409, "pairing-already-completed");
  }

  return success({
    status: "approved",
    ...grant,
  });
}
