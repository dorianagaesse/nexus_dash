import crypto from "node:crypto";

import {
  ApiCredentialScope,
  Prisma,
  type AuthAuditAction as DbAuthAuditAction,
} from "@prisma/client";

import {
  AGENT_API_KEY_PUBLIC_ID_PREFIX,
  buildRawAgentApiKey,
  parseAgentScopes,
  parseRawAgentApiKey,
  resolveAgentCredentialStatus,
  normalizeAgentCredentialLabel,
  isValidAgentCredentialLabel,
  type AgentAuditAction,
  type AgentCredentialStatus,
  type AgentScope,
} from "@/lib/agent-access";
import { getAgentAccessTokenTtlSeconds } from "@/lib/env.server";
import { issueAgentAccessToken } from "@/lib/auth/agent-token-service";
import { prisma } from "@/lib/prisma";
import { verifySecret, hashSecret } from "@/lib/services/password-service";
import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

const MAX_AGENT_CREDENTIAL_ID_GENERATION_ATTEMPTS = 5;
const AGENT_CREDENTIAL_PUBLIC_ID_BYTES = 12;
const AGENT_CREDENTIAL_SECRET_BYTES = 32;
const MAX_AGENT_CREDENTIAL_EXPIRY_DAYS = 365;
const MAX_IP_ADDRESS_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;

interface ServiceError {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export interface ProjectAgentCredentialSummary {
  id: string;
  label: string;
  publicId: string;
  scopes: AgentScope[];
  status: AgentCredentialStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastExchangedAt: string | null;
  lastRotatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentAuditEventSummary {
  id: string;
  action: AgentAuditAction;
  credentialId: string | null;
  credentialLabel: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  path: string | null;
  createdAt: string;
}

export interface ProjectAgentAccessSummary {
  projectId: string;
  accessTokenTtlSeconds: number;
  credentials: ProjectAgentCredentialSummary[];
  recentEvents: ProjectAgentAuditEventSummary[];
}

const AGENT_SCOPE_TO_DB_SCOPE: Record<AgentScope, ApiCredentialScope> = {
  "project:read": ApiCredentialScope.project_read,
  "task:read": ApiCredentialScope.task_read,
  "task:write": ApiCredentialScope.task_write,
  "task:delete": ApiCredentialScope.task_delete,
  "context:read": ApiCredentialScope.context_read,
  "context:write": ApiCredentialScope.context_write,
  "context:delete": ApiCredentialScope.context_delete,
};

const DB_SCOPE_TO_AGENT_SCOPE: Record<ApiCredentialScope, AgentScope> = {
  [ApiCredentialScope.project_read]: "project:read",
  [ApiCredentialScope.task_read]: "task:read",
  [ApiCredentialScope.task_write]: "task:write",
  [ApiCredentialScope.task_delete]: "task:delete",
  [ApiCredentialScope.context_read]: "context:read",
  [ApiCredentialScope.context_write]: "context:write",
  [ApiCredentialScope.context_delete]: "context:delete",
};

function createError(status: number, error: string): ServiceError {
  return { ok: false, status, error };
}

function createSuccess<T>(status: number, data: T): ServiceSuccess<T> {
  return { ok: true, status, data };
}

function normalizeActorUserId(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeBoundedString(
  value: string | null | undefined,
  maxLength: number
): string | null {
  const trimmedValue = normalizeTrimmedString(value);
  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

function normalizeExpiryDays(value: number | null | undefined): number | null | "invalid" {
  if (value == null) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0 || value > MAX_AGENT_CREDENTIAL_EXPIRY_DAYS) {
    return "invalid";
  }

  return value;
}

function resolveExpiresAt(expiresInDays: number | null | undefined): Date | null | "invalid" {
  const normalizedExpiryDays = normalizeExpiryDays(expiresInDays);
  if (normalizedExpiryDays === "invalid") {
    return "invalid";
  }

  if (normalizedExpiryDays == null) {
    return null;
  }

  return new Date(Date.now() + normalizedExpiryDays * 24 * 60 * 60 * 1000);
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return readPrismaErrorCode(error) === "P2002";
}

function readPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  return "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function readUniqueConstraintTargets(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const candidate = error as {
    meta?: {
      target?: string[] | string;
    };
  };

  const targets = candidate.meta?.target;
  if (Array.isArray(targets)) {
    return targets.filter((target): target is string => typeof target === "string");
  }

  if (typeof targets === "string") {
    return [targets];
  }

  return [];
}

function isPublicIdUniqueConstraint(error: unknown): boolean {
  return readUniqueConstraintTargets(error).includes("publicId");
}

function generateCredentialPublicId(): string {
  return `${AGENT_API_KEY_PUBLIC_ID_PREFIX}${crypto
    .randomBytes(AGENT_CREDENTIAL_PUBLIC_ID_BYTES)
    .toString("base64url")}`;
}

function generateCredentialSecret(): string {
  return crypto.randomBytes(AGENT_CREDENTIAL_SECRET_BYTES).toString("base64url");
}

function mapDbScopeToAgentScope(scope: ApiCredentialScope): AgentScope {
  return DB_SCOPE_TO_AGENT_SCOPE[scope];
}

function readJsonMetadataString(
  metadata: Prisma.JsonValue | null | undefined,
  key: string
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildCredentialSummary(record: {
  id: string;
  label: string;
  publicId: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastExchangedAt: Date | null;
  lastRotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  scopeGrants: Array<{
    scope: ApiCredentialScope;
  }>;
}): ProjectAgentCredentialSummary {
  return {
    id: record.id,
    label: record.label,
    publicId: record.publicId,
    scopes: record.scopeGrants.map((grant) => mapDbScopeToAgentScope(grant.scope)),
    status: resolveAgentCredentialStatus({
      revokedAt: record.revokedAt,
      expiresAt: record.expiresAt,
    }),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    lastExchangedAt: record.lastExchangedAt?.toISOString() ?? null,
    lastRotatedAt: record.lastRotatedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildAuditEventSummary(record: {
  id: string;
  action: DbAuthAuditAction;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  credential: {
    id: string;
    label: string;
  } | null;
}): ProjectAgentAuditEventSummary {
  return {
    id: record.id,
    action: record.action,
    credentialId: record.credential?.id ?? null,
    credentialLabel: record.credential?.label ?? null,
    requestId: record.requestId,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    httpMethod: readJsonMetadataString(record.metadata, "httpMethod"),
    path: readJsonMetadataString(record.metadata, "path"),
    createdAt: record.createdAt.toISOString(),
  };
}

function buildAuditMetadata(input: {
  scopes?: AgentScope[];
  publicId?: string;
  expiresAt?: Date | null;
  tokenId?: string;
  httpMethod?: string | null;
  path?: string | null;
}) {
  return {
    scopes: input.scopes ?? null,
    publicId: input.publicId ?? null,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    tokenId: input.tokenId ?? null,
    httpMethod: normalizeTrimmedString(input.httpMethod ?? null),
    path: normalizeTrimmedString(input.path ?? null),
  };
}

async function createCredentialRecordWithUniquePublicId(
  db: typeof prisma | Prisma.TransactionClient,
  input: {
    projectId: string;
    createdByUserId: string;
    label: string;
    secretHash: string;
    expiresAt: Date | null;
    scopes: AgentScope[];
  }
) {
  for (
    let attempt = 0;
    attempt < MAX_AGENT_CREDENTIAL_ID_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const publicId = generateCredentialPublicId();

    try {
      return await db.apiCredential.create({
        data: {
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          label: input.label,
          publicId,
          secretHash: input.secretHash,
          expiresAt: input.expiresAt,
          scopeGrants: {
            create: input.scopes.map((scope) => ({
              scope: AGENT_SCOPE_TO_DB_SCOPE[scope],
            })),
          },
        },
        select: {
          id: true,
          label: true,
          publicId: true,
          expiresAt: true,
          lastUsedAt: true,
          lastExchangedAt: true,
          lastRotatedAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          scopeGrants: {
            select: {
              scope: true,
            },
            orderBy: {
              scope: "asc",
            },
          },
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error) || !isPublicIdUniqueConstraint(error)) {
        throw error;
      }
    }
  }

  throw new Error("agent-credential-public-id-generation-failed");
}

async function rotateCredentialSecretWithUniquePublicId(
  db: typeof prisma | Prisma.TransactionClient,
  input: {
    credentialId: string;
    secretHash: string;
  }
) {
  for (
    let attempt = 0;
    attempt < MAX_AGENT_CREDENTIAL_ID_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const publicId = generateCredentialPublicId();

    try {
      return await db.apiCredential.update({
        where: { id: input.credentialId },
        data: {
          publicId,
          secretHash: input.secretHash,
          lastRotatedAt: new Date(),
          lastExchangedAt: null,
          lastUsedAt: null,
        },
        select: {
          id: true,
          label: true,
          publicId: true,
          expiresAt: true,
          lastUsedAt: true,
          lastExchangedAt: true,
          lastRotatedAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          scopeGrants: {
            select: {
              scope: true,
            },
            orderBy: {
              scope: "asc",
            },
          },
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error) || !isPublicIdUniqueConstraint(error)) {
        throw error;
      }
    }
  }

  throw new Error("agent-credential-public-id-generation-failed");
}

export async function getProjectAgentAccessSummary(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ServiceResult<ProjectAgentAccessSummary>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const [credentials, recentEvents] = await Promise.all([
      db.apiCredential.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          label: true,
          publicId: true,
          expiresAt: true,
          lastUsedAt: true,
          lastExchangedAt: true,
          lastRotatedAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          scopeGrants: {
            orderBy: [{ scope: "asc" }],
            select: {
              scope: true,
            },
          },
        },
      }),
      db.authAuditEvent.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 12,
        select: {
          id: true,
          action: true,
          requestId: true,
          ipAddress: true,
          userAgent: true,
          metadata: true,
          createdAt: true,
          credential: {
            select: {
              id: true,
              label: true,
            },
          },
        },
      }),
    ]);

    return createSuccess(200, {
      projectId: input.projectId,
      accessTokenTtlSeconds: getAgentAccessTokenTtlSeconds(),
      credentials: credentials.map((credential) => buildCredentialSummary(credential)),
      recentEvents: recentEvents.map((event) => buildAuditEventSummary(event)),
    });
  });
}

export async function createProjectAgentCredential(input: {
  actorUserId: string;
  projectId: string;
  label: string;
  scopes: AgentScope[];
  expiresInDays: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<
  ServiceResult<{
    credential: ProjectAgentCredentialSummary;
    apiKey: string;
    accessTokenTtlSeconds: number;
  }>
> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const label = normalizeAgentCredentialLabel(input.label);
  if (!isValidAgentCredentialLabel(label)) {
    return createError(400, "invalid-label");
  }

  const scopes = parseAgentScopes(input.scopes);
  if (scopes.length === 0) {
    return createError(400, "scopes-required");
  }

  const expiresAt = resolveExpiresAt(input.expiresInDays);
  if (expiresAt === "invalid") {
    return createError(400, "invalid-expiry");
  }

  const secret = generateCredentialSecret();
  const secretHash = await hashSecret(secret);

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const createdCredential = await createCredentialRecordWithUniquePublicId(db, {
      projectId: input.projectId,
      createdByUserId: actorUserId,
      label,
      secretHash,
      expiresAt,
      scopes,
    });

    await db.authAuditEvent.create({
      data: {
        projectId: input.projectId,
        credentialId: createdCredential.id,
        actorUserId,
        actorKind: "human",
        action: "credential_created",
        requestId: normalizeTrimmedString(input.requestId ?? null),
        ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
        userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
        metadata: buildAuditMetadata({
          scopes,
          publicId: createdCredential.publicId,
          expiresAt,
        }),
      },
    });

    return createSuccess(201, {
      credential: buildCredentialSummary(createdCredential),
      apiKey: buildRawAgentApiKey({
        publicId: createdCredential.publicId,
        secret,
      }),
      accessTokenTtlSeconds: getAgentAccessTokenTtlSeconds(),
    });
  });
}

export async function rotateProjectAgentCredential(input: {
  actorUserId: string;
  projectId: string;
  credentialId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<
  ServiceResult<{
    credential: ProjectAgentCredentialSummary;
    apiKey: string;
    accessTokenTtlSeconds: number;
  }>
> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const credentialId = normalizeTrimmedString(input.credentialId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!credentialId) {
    return createError(400, "credential-required");
  }

  const secret = generateCredentialSecret();
  const secretHash = await hashSecret(secret);

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingCredential = await db.apiCredential.findFirst({
      where: {
        id: credentialId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!existingCredential) {
      return createError(404, "credential-not-found");
    }

    if (existingCredential.revokedAt) {
      return createError(409, "credential-revoked");
    }

    if (
      existingCredential.expiresAt &&
      existingCredential.expiresAt.getTime() <= Date.now()
    ) {
      return createError(409, "credential-expired");
    }

    const rotatedCredential = await rotateCredentialSecretWithUniquePublicId(db, {
      credentialId,
      secretHash,
    });

    await db.authAuditEvent.create({
      data: {
        projectId: input.projectId,
        credentialId: rotatedCredential.id,
        actorUserId,
        actorKind: "human",
        action: "credential_rotated",
        requestId: normalizeTrimmedString(input.requestId ?? null),
        ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
        userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
        metadata: buildAuditMetadata({
          scopes: rotatedCredential.scopeGrants.map((grant) =>
            mapDbScopeToAgentScope(grant.scope)
          ),
          publicId: rotatedCredential.publicId,
          expiresAt: rotatedCredential.expiresAt,
        }),
      },
    });

    return createSuccess(200, {
      credential: buildCredentialSummary(rotatedCredential),
      apiKey: buildRawAgentApiKey({
        publicId: rotatedCredential.publicId,
        secret,
      }),
      accessTokenTtlSeconds: getAgentAccessTokenTtlSeconds(),
    });
  });
}

export async function revokeProjectAgentCredential(input: {
  actorUserId: string;
  projectId: string;
  credentialId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ServiceResult<{ credential: ProjectAgentCredentialSummary }>> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const credentialId = normalizeTrimmedString(input.credentialId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  if (!credentialId) {
    return createError(400, "credential-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingCredential = await db.apiCredential.findFirst({
      where: {
        id: credentialId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        label: true,
        publicId: true,
        expiresAt: true,
        lastUsedAt: true,
        lastExchangedAt: true,
        lastRotatedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        scopeGrants: {
          orderBy: [{ scope: "asc" }],
          select: {
            scope: true,
          },
        },
      },
    });

    if (!existingCredential) {
      return createError(404, "credential-not-found");
    }

    if (existingCredential.revokedAt) {
      return createSuccess(200, {
        credential: buildCredentialSummary(existingCredential),
      });
    }

    const revokedCredential = await db.apiCredential.update({
      where: { id: credentialId },
      data: {
        revokedAt: new Date(),
        revokedByUserId: actorUserId,
      },
      select: {
        id: true,
        label: true,
        publicId: true,
        expiresAt: true,
        lastUsedAt: true,
        lastExchangedAt: true,
        lastRotatedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        scopeGrants: {
          orderBy: [{ scope: "asc" }],
          select: {
            scope: true,
          },
        },
      },
    });

    await db.authAuditEvent.create({
      data: {
        projectId: input.projectId,
        credentialId: revokedCredential.id,
        actorUserId,
        actorKind: "human",
        action: "credential_revoked",
        requestId: normalizeTrimmedString(input.requestId ?? null),
        ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
        userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
        metadata: buildAuditMetadata({
          scopes: revokedCredential.scopeGrants.map((grant) =>
            mapDbScopeToAgentScope(grant.scope)
          ),
          publicId: revokedCredential.publicId,
          expiresAt: revokedCredential.expiresAt,
        }),
      },
    });

    return createSuccess(200, {
      credential: buildCredentialSummary(revokedCredential),
    });
  });
}

export async function exchangeAgentApiKeyForAccessToken(input: {
  apiKey: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<
  ServiceResult<{
    accessToken: string;
    tokenType: "Bearer";
    expiresAt: string;
    expiresInSeconds: number;
    projectId: string;
    scopes: AgentScope[];
  }>
> {
  const parsedApiKey = parseRawAgentApiKey(input.apiKey);
  if (!parsedApiKey) {
    return createError(401, "invalid-api-key");
  }

  const credential = await prisma.apiCredential.findUnique({
    where: {
      publicId: parsedApiKey.publicId,
    },
    select: {
      id: true,
      label: true,
      secretHash: true,
      publicId: true,
      projectId: true,
      createdByUserId: true,
      expiresAt: true,
      revokedAt: true,
      scopeGrants: {
        orderBy: [{ scope: "asc" }],
        select: {
          scope: true,
        },
      },
    },
  });

  if (!credential) {
    return createError(401, "invalid-api-key");
  }

  const secretMatches = await verifySecret(parsedApiKey.secret, credential.secretHash);
  if (!secretMatches) {
    return createError(401, "invalid-api-key");
  }

  if (
    credential.revokedAt ||
    (credential.expiresAt && credential.expiresAt.getTime() <= Date.now())
  ) {
    return createError(401, "invalid-api-key");
  }

  const scopes = credential.scopeGrants.map((grant) =>
    mapDbScopeToAgentScope(grant.scope)
  );
  const issuedToken = issueAgentAccessToken({
    credentialId: credential.id,
    projectId: credential.projectId,
    ownerUserId: credential.createdByUserId,
    scopes,
  });

  await prisma.$transaction([
    prisma.apiCredential.update({
      where: { id: credential.id },
      data: {
        lastExchangedAt: issuedToken.issuedAt,
      },
    }),
    prisma.authAuditEvent.create({
      data: {
        projectId: credential.projectId,
        credentialId: credential.id,
        actorUserId: credential.createdByUserId,
        actorKind: "agent",
        action: "token_exchanged",
        requestId: normalizeTrimmedString(input.requestId ?? null),
        ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
        userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
        metadata: buildAuditMetadata({
          scopes,
          publicId: credential.publicId,
          expiresAt: credential.expiresAt,
          tokenId: issuedToken.tokenId,
        }),
      },
    }),
  ]);

  return createSuccess(200, {
    accessToken: issuedToken.accessToken,
    tokenType: "Bearer",
    expiresAt: issuedToken.expiresAt.toISOString(),
    expiresInSeconds: issuedToken.expiresInSeconds,
    projectId: credential.projectId,
    scopes,
  });
}

export async function recordAgentRequestUsage(input: {
  credentialId: string;
  ownerUserId: string;
  projectId: string;
  tokenId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  path?: string | null;
}): Promise<ServiceResult<{ ok: true }>> {
  const credentialId = normalizeTrimmedString(input.credentialId);
  const ownerUserId = normalizeActorUserId(input.ownerUserId);
  if (!credentialId || !ownerUserId) {
    return createError(400, "invalid-agent-usage");
  }

  const requestTimestamp = new Date();
  try {
    await prisma.$transaction([
      prisma.apiCredential.update({
        where: { id: credentialId },
        data: {
          lastUsedAt: requestTimestamp,
        },
      }),
      prisma.authAuditEvent.create({
        data: {
          projectId: input.projectId,
          credentialId,
          actorUserId: ownerUserId,
          actorKind: "agent",
          action: "request_used",
          requestId: normalizeTrimmedString(input.requestId ?? null),
          ipAddress: normalizeBoundedString(input.ipAddress ?? null, MAX_IP_ADDRESS_LENGTH),
          userAgent: normalizeBoundedString(input.userAgent ?? null, MAX_USER_AGENT_LENGTH),
          metadata: buildAuditMetadata({
            tokenId: input.tokenId,
            httpMethod: input.httpMethod ?? null,
            path: input.path ?? null,
          }),
        },
      }),
    ]);
  } catch (error) {
    const prismaErrorCode = readPrismaErrorCode(error);
    if (prismaErrorCode === "P2025" || prismaErrorCode === "P2003") {
      return createError(401, "unauthorized");
    }

    return createError(500, "agent-usage-not-recorded");
  }

  return createSuccess(200, { ok: true as const });
}
