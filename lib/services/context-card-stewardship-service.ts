import { Prisma } from "@prisma/client";

import {
  type ContextCardActorReference,
  type ContextCardActorSummary,
  isContextCardActorReference,
} from "@/lib/context-card-actor";
import { logServerError } from "@/lib/observability/logger";
import { touchProjectActivity } from "@/lib/services/project-activity-service";
import {
  buildProjectPrincipalWhere,
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import {
  loadContextCardActorRegistry,
  mapStoredContextCardActor,
  resolveContextCardMutationActor,
  resolveAssignableContextCardActor,
  contextCardActorCredentialSelect,
  contextCardActorUserSelect,
  type ContextCardActorRegistry,
} from "@/lib/services/context-card-actor-service";
import {
  RESOURCE_TYPE_CONTEXT_CARD,
} from "@/lib/resource-type";
import { withActorRlsContext } from "@/lib/services/rls-context";

const DEFAULT_CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = 90;

export interface ContextCardReviewState {
  needsReview: boolean;
  thresholdDays: number;
  lastEditedAt: Date;
}

export interface ContextCardProjection {
  id: string;
  creator: ContextCardActorSummary | null;
  lastEditor: ContextCardActorSummary | null;
  steward: ContextCardActorSummary | null;
  review: ContextCardReviewState;
  attachments: ContextCardAttachmentProjection[];
}

export interface ContextCardAttachmentProjection {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: ContextCardActorSummary | null;
  uploadedByDisplayNameSnapshot: string;
  uploadedAt: Date;
}

export interface ContextCardStewardshipSummary {
  cardId: string;
  steward: ContextCardActorSummary | null;
  needsReview: boolean;
  thresholdDays: number;
  lastEditedAt: Date;
}

interface ServiceErrorResult {
  ok: false;
  status: number;
  error: string;
}

interface ServiceSuccessResult<T> {
  ok: true;
  data: T;
}

type ServiceResult<T> = ServiceSuccessResult<T> | ServiceErrorResult;

export interface ContextCardCardRecord {
  id: string;
  projectId: string;
  updatedAt: Date;
  createdByUserId: string | null;
  createdByCredentialId: string | null;
  creatorKind: "human" | "agent";
  creatorDisplayNameSnapshot: string;
  lastEditedByUserId: string | null;
  lastEditedByCredentialId: string | null;
  lastEditorKind: "human" | "agent" | null;
  lastEditorDisplayNameSnapshot: string | null;
  stewardUserId: string | null;
  stewardCredentialId: string | null;
  stewardKind: "human" | "agent" | null;
  stewardDisplayNameSnapshot: string | null;
  createdByUser?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
  createdByCredential?: {
    id: string;
    label: string;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  lastEditedByUser?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
  lastEditedByCredential?: {
    id: string;
    label: string;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  stewardUser?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
  stewardCredential?: {
    id: string;
    label: string;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  attachments?: ContextCardAttachmentRecord[];
}

export interface ContextCardAttachmentRecord {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByUserId: string;
  uploadedByKind: "human" | "agent";
  uploadedByDisplayNameSnapshot: string;
  createdAt: Date;
  uploadedBy?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
}

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function createError(status: number, error: string): ServiceErrorResult {
  return { ok: false, status, error };
}

export function getContextCardReviewThresholdDays(): number {
  const fromEnv = Number.parseInt(
    process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS ?? "",
    10
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
}

export function resolveContextCardReviewState(input: {
  updatedAt: Date;
  referenceNowMs?: number;
  thresholdDays?: number;
}): ContextCardReviewState {
  const thresholdDays = input.thresholdDays ?? getContextCardReviewThresholdDays();
  const referenceNowMs = input.referenceNowMs ?? Date.now();
  const lastEditedAt = input.updatedAt;
  const ageMs = referenceNowMs - lastEditedAt.getTime();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  return {
    needsReview: ageMs >= thresholdMs,
    thresholdDays,
    lastEditedAt,
  };
}

function mapAttachmentProjection(
  attachment: ContextCardAttachmentRecord,
  registry: ContextCardActorRegistry | null,
  now: Date
): ContextCardAttachmentProjection {
  const uploader =
    attachment.uploadedByKind === "human"
      ? mapStoredContextCardActor({
          kind: "human",
          id: attachment.uploadedByUserId,
          displayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
          user: attachment.uploadedBy,
          isCurrentProjectHuman: Boolean(
            attachment.uploadedByUserId &&
              registry?.activeHumanIds.has(attachment.uploadedByUserId)
          ),
        })
      : mapStoredContextCardActor({
          kind: "agent",
          id: attachment.uploadedByUserId,
          displayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
        });
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    url: attachment.url,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedBy: uploader,
    uploadedByDisplayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
    uploadedAt: attachment.createdAt,
  };
}

export function projectContextCard(input: {
  card: ContextCardCardRecord;
  referenceNowMs?: number;
  thresholdDays?: number;
  now?: Date;
  registry?: ContextCardActorRegistry | null;
}): ContextCardProjection {
  const registry = input.registry ?? null;
  const now = input.now ?? new Date();

  function isCurrentHuman(userId: string | null): boolean | undefined {
    if (!userId || !registry) {
      return undefined;
    }
    return registry.activeHumanIds.has(userId);
  }

  return {
    id: input.card.id,
    creator: mapStoredContextCardActor({
      kind: input.card.creatorKind,
      id:
        input.card.creatorKind === "human"
          ? input.card.createdByUserId
          : input.card.createdByCredentialId,
      displayNameSnapshot: input.card.creatorDisplayNameSnapshot,
      user: input.card.createdByUser,
      credential: input.card.createdByCredential,
      isCurrentProjectHuman: isCurrentHuman(input.card.createdByUserId),
    }),
    lastEditor:
      input.card.lastEditorKind && input.card.lastEditorDisplayNameSnapshot
        ? mapStoredContextCardActor({
            kind: input.card.lastEditorKind,
            id:
              input.card.lastEditorKind === "human"
                ? input.card.lastEditedByUserId
                : input.card.lastEditedByCredentialId,
            displayNameSnapshot: input.card.lastEditorDisplayNameSnapshot,
            user: input.card.lastEditedByUser,
            credential: input.card.lastEditedByCredential,
            isCurrentProjectHuman: isCurrentHuman(input.card.lastEditedByUserId),
          })
        : null,
    steward:
      input.card.stewardKind && input.card.stewardDisplayNameSnapshot
        ? mapStoredContextCardActor({
            kind: input.card.stewardKind,
            id:
              input.card.stewardKind === "human"
                ? input.card.stewardUserId
                : input.card.stewardCredentialId,
            displayNameSnapshot: input.card.stewardDisplayNameSnapshot,
            user: input.card.stewardUser,
            credential: input.card.stewardCredential,
            isCurrentProjectHuman: isCurrentHuman(input.card.stewardUserId),
          })
        : null,
    review: resolveContextCardReviewState({
      updatedAt: input.card.updatedAt,
      referenceNowMs: input.referenceNowMs,
      thresholdDays: input.thresholdDays,
    }),
    attachments: (input.card.attachments ?? []).map((attachment) =>
      mapAttachmentProjection(attachment, registry, now)
    ),
  };
}

export const contextCardCardSelect = {
  id: true,
  projectId: true,
  updatedAt: true,
  createdByUserId: true,
  createdByCredentialId: true,
  creatorKind: true,
  creatorDisplayNameSnapshot: true,
  lastEditedByUserId: true,
  lastEditedByCredentialId: true,
  lastEditorKind: true,
  lastEditorDisplayNameSnapshot: true,
  stewardUserId: true,
  stewardCredentialId: true,
  stewardKind: true,
  stewardDisplayNameSnapshot: true,
  createdByUser: { select: contextCardActorUserSelect },
  createdByCredential: { select: contextCardActorCredentialSelect },
  lastEditedByUser: { select: contextCardActorUserSelect },
  lastEditedByCredential: { select: contextCardActorCredentialSelect },
  stewardUser: { select: contextCardActorUserSelect },
  stewardCredential: { select: contextCardActorCredentialSelect },
} satisfies Prisma.ResourceSelect;

export const contextCardAttachmentSelect = {
  id: true,
  kind: true,
  name: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  uploadedByUserId: true,
  uploadedByKind: true,
  uploadedByDisplayNameSnapshot: true,
  createdAt: true,
  uploadedBy: { select: contextCardActorUserSelect },
} satisfies Prisma.ResourceAttachmentSelect;

export async function findContextCardForProject(input: {
  db: Prisma.TransactionClient;
  projectId: string;
  cardId: string;
}): Promise<ContextCardCardRecord | null> {
  return input.db.resource.findFirst({
    where: {
      id: input.cardId,
      projectId: input.projectId,
      type: RESOURCE_TYPE_CONTEXT_CARD,
    },
    select: contextCardCardSelect,
  }) as Promise<ContextCardCardRecord | null>;
}

export async function assignContextCardSteward(input: {
  actorUserId: string;
  projectId: string;
  cardId: string;
  steward: ContextCardActorReference | null;
  agentAccess?: AgentProjectAccessContext;
  referenceNowMs?: number;
  thresholdDays?: number;
}): Promise<ServiceResult<ContextCardStewardshipSummary>> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  const cardId = normalizeIdentifier(input.cardId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!projectId || !cardId) {
    return createError(400, "context-card-missing");
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId,
    requiredScopes: ["context:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const existingCard = await db.resource.findFirst({
      where: {
        id: cardId,
        projectId,
        type: RESOURCE_TYPE_CONTEXT_CARD,
      },
      select: { id: true },
    });
    if (!existingCard) {
      return createError(404, "context-card-not-found");
    }

    let stewardPersistence: {
      userId: string | null;
      credentialId: string | null;
      displayNameSnapshot: string;
    } | null = null;
    if (input.steward !== null) {
      if (!isContextCardActorReference(input.steward)) {
        return createError(400, "context-card-steward-invalid");
      }
      const resolved = await resolveAssignableContextCardActor({
        db,
        projectId,
        reference: input.steward,
      });
      if (!resolved.ok) {
        return createError(resolved.status, resolved.error);
      }
      stewardPersistence = {
        userId: resolved.actor.userId,
        credentialId: resolved.actor.credentialId,
        displayNameSnapshot: resolved.actor.displayNameSnapshot,
      };
    }

    try {
      const updatedCard = await db.resource.update({
        where: { id: cardId },
        data: stewardPersistence
          ? {
              stewardUserId: stewardPersistence.userId,
              stewardCredentialId: stewardPersistence.credentialId,
              stewardKind: input.steward?.kind ?? null,
              stewardDisplayNameSnapshot: stewardPersistence.displayNameSnapshot,
            }
          : {
              stewardUserId: null,
              stewardCredentialId: null,
              stewardKind: null,
              stewardDisplayNameSnapshot: null,
            },
        select: contextCardCardSelect,
      });

      await touchProjectActivity({ db, projectId });

      const registry = await loadContextCardActorRegistry({ db, projectId });
      const projection = projectContextCard({
        card: updatedCard as ContextCardCardRecord,
        referenceNowMs: input.referenceNowMs,
        thresholdDays: input.thresholdDays,
        registry,
      });

      return {
        ok: true,
        data: {
          cardId: updatedCard.id,
          steward: projection.steward,
          needsReview: projection.review.needsReview,
          thresholdDays: projection.review.thresholdDays,
          lastEditedAt: projection.review.lastEditedAt,
        },
      };
    } catch (error) {
      logServerError("assignContextCardSteward", error);
      return createError(500, "context-card-stewardship-update-failed");
    }
  });
}

export async function recordContextCardEditor(input: {
  db: Prisma.TransactionClient;
  cardId: string;
  editor: { userId: string | null; credentialId: string | null; displayNameSnapshot: string; kind: "human" | "agent" };
}): Promise<void> {
  await input.db.resource.update({
    where: { id: input.cardId },
    data: {
      lastEditedByUserId: input.editor.userId,
      lastEditedByCredentialId: input.editor.credentialId,
      lastEditorKind: input.editor.kind,
      lastEditorDisplayNameSnapshot: input.editor.displayNameSnapshot,
    },
  });
}

export async function recordContextCardCreator(input: {
  db: Prisma.TransactionClient;
  cardId: string;
  creator: { userId: string | null; credentialId: string | null; displayNameSnapshot: string; kind: "human" | "agent" };
}): Promise<void> {
  await input.db.resource.update({
    where: { id: input.cardId },
    data: {
      createdByUserId: input.creator.userId,
      createdByCredentialId: input.creator.credentialId,
      creatorKind: input.creator.kind,
      creatorDisplayNameSnapshot: input.creator.displayNameSnapshot,
      lastEditedByUserId: input.creator.userId,
      lastEditedByCredentialId: input.creator.credentialId,
      lastEditorKind: input.creator.kind,
      lastEditorDisplayNameSnapshot: input.creator.displayNameSnapshot,
    },
  });
}

export function getContextCardStewardshipActorContext(input: {
  actorUserId: string;
  agentAccess?: AgentProjectAccessContext;
}) {
  return {
    actorUserId: input.actorUserId,
    agentAccess: input.agentAccess,
  };
}

// Expose registry helper for callers (e.g., dashboard loader) that need to
// hydrate stewards/creators without going through the service boundary.
export async function loadContextCardActorRegistryForProject(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ContextCardActorRegistry | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId || !projectId) {
    return null;
  }
  return withActorRlsContext(actorUserId, async (db) => {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        ...buildProjectPrincipalWhere(actorUserId),
      },
      select: { id: true },
    });
    if (!project) {
      return null;
    }
    return loadContextCardActorRegistry({ db, projectId });
  }) as Promise<ContextCardActorRegistry | null>;
}

export { resolveContextCardMutationActor };
